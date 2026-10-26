"""Decides when each league sync runs. Task Scheduler starts it every minute.

    python sync_runner.py tick                 # what Task Scheduler runs; usually does nothing
    python sync_runner.py status               # what ran last and what's next
    python sync_runner.py moves-every 15       # ESPN move checks: every 1 or 15 minutes
    python sync_runner.py run nightly          # run a job by hand (see JOBS: moves, quick, stats, ...)
    python sync_runner.py install              # print the Task Scheduler command

The website's Updates page (/updates) shows this schedule and the last run of each job. The LM
can change the timings, pause a job, or ask for a Run now there; this PC picks it up within a minute.

Default schedule (Central time):
  ESPN moves   checked every 1 or 15 min. ESPN is asked each time (free, Neon stays
               asleep); Neon is written only when a roster or transaction changed.
  Sync Now     the website button. Checked every minute when SITE_URL is set.
  Stats        every 17 min from the first tip until every game is final:
               live fantasy scores, NBA scores, tracking stats for finished games.
  Post-game    30 min after the last game ends: everything (stats, standings,
               rosters, heat rankings, backup).
  Nightly      6:00am, retried until 8:00 if the PC was off. Skipped when the
               post-game run already happened for last night's games.
  Nothing else runs from midnight to 6am, except games that are still going.

Nothing here writes to Neon itself: each job runs the existing scripts, and
their output goes to logs\\runner-YYYY-MM-DD.log.
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")
CENTRAL = ZoneInfo("America/Chicago")
EASTERN = ZoneInfo("America/New_York")
CACHE = HERE / "raw_cache"
STATE_FILE = CACHE / "runner_state.json"
LOCK_FILE = CACHE / "runner.lock"
SCHEDULE_CACHE = CACHE / "schedule.json"
TODAY_CACHE = CACHE / "today.json"
PY = sys.executable

# The schedule the website's Updates page (/updates) can change. Its values win over these
# (and over `moves-every` below); the PC picks them up at its next minute check.
DEFAULTS = {"moves_every": 1,              # minutes between ESPN move checks
            "stats_every": 17,             # minutes between stat runs while games are on
            "postgame_delay": 30,          # minutes after the last game goes final
            "nightly_hour": 6,             # morning run starts at this hour (Central), retried for 2 hours
            "paused": []}                  # any of: moves, stats, postgame, nightly
LIMITS = {"moves_every": (1, 60), "stats_every": (5, 60), "postgame_delay": (0, 180), "nightly_hour": (0, 10)}
PAUSABLE = ("moves", "stats", "postgame", "nightly")
NIGHTLY_HOURS = 2
NIGHTLY_RETRY = timedelta(minutes=15)
REPORT_EVERY = timedelta(minutes=15)       # heartbeat to the Updates page when nothing ran
MAX_GAME_WINDOW = timedelta(hours=8)       # stop stat runs this long after the first tip, final or not
LOCK_STALE = timedelta(minutes=45)
FINAL = 3

# Each job is a list of script commands, run in order. A failing step doesn't stop the rest.
JOBS = {
    "moves":    [["espn_sync.py", "rosters"], ["espn_sync.py", "transactions"]],   # rosters adds new players
    "quick":    [["espn_sync.py", "rosters"], ["espn_sync.py", "transactions"],
                 ["espn_sync.py", "standings"], ["espn_sync.py", "scores", "--current"]],
    "stats":    [["espn_sync.py", "scores", "--current"], ["nba_sync.py", "today", "--date", "{slate}"],
                 ["nba_sync.py", "games", "--date", "{slate}", "--new-only"]],
    "postgame": [["espn_sync.py", "nightly", "--current"], ["nba_sync.py", "today", "--date", "{slate}"],
                 ["nba_sync.py", "games", "--date", "{slate}", "--new-only"], ["nba_sync.py", "link"],
                 ["nba_sync.py", "schedule"], "heat", ["backup_db.py"]],
    "nightly":  [["espn_sync.py", "nightly"], ["nba_sync.py", "schedule"],     # morning: last night's games
                 ["nba_sync.py", "games", "--date", "{last_night}", "--new-only"], ["nba_sync.py", "link"],
                 "heat", ["backup_db.py"]],
    # single pieces, for the Updates page's Run now buttons and `run` by hand
    "schedule": [["nba_sync.py", "schedule"]],
    "heat":     ["heat"],
    "backup":   [["backup_db.py"]],
}


def clean_schedule(raw):
    """Schedule values from the website, kept only when they make sense."""
    out = {}
    for key, (lo, hi) in LIMITS.items():
        try:
            value = int((raw or {}).get(key))
        except (TypeError, ValueError):
            continue
        if lo <= value <= hi:
            out[key] = value
    paused = (raw or {}).get("paused")
    if isinstance(paused, list):
        out["paused"] = [j for j in PAUSABLE if j in paused]
    return out


# ---------------------------------------------------------------- state

def load_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except (OSError, ValueError):
        return {}


def save_state(state):
    CACHE.mkdir(exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=1, sort_keys=True))


def when(state, key):
    value = state.get(key)
    return datetime.fromisoformat(value) if value else None


def stamp(state, key, moment):
    state[key] = moment.isoformat()


# ---------------------------------------------------------------- schedule

def slate_date(now):
    """The NBA game date a moment belongs to. Games are dated in Eastern time, and a
    late game still counts for its own night, so the date rolls over at 5am Eastern."""
    return (now.astimezone(EASTERN) - timedelta(hours=5)).date()


def load_slate(day):
    """Tip times (Central) for one game date, from the local schedule copy."""
    try:
        games = json.loads(SCHEDULE_CACHE.read_text())
    except (OSError, ValueError):
        return []
    return sorted(datetime.fromisoformat(g["tip_utc"]).astimezone(CENTRAL)
                  for g in games if g["game_date"] == day.isoformat() and g.get("tip_utc"))


def slate_final(day):
    """True when the last live check saw every game of that date final."""
    try:
        today = json.loads(TODAY_CACHE.read_text())
    except (OSError, ValueError):
        return False
    games = today.get("games", {})
    return today.get("date") == day.isoformat() and bool(games) and all(s == FINAL for s in games.values())


# ---------------------------------------------------------------- planning

def plan(now, state, tips, all_final, settings):
    """Which jobs are due right now. Pure function of its inputs, so it can be tested.

    now        aware datetime (any zone)
    state      dict of the last run times (see save_state)
    tips       tip times for the current slate (aware datetimes), empty on no-game days
    all_final  every game of the slate is final
    settings   DEFAULTS keys (missing ones use DEFAULTS), plus "sync_now": requested-at iso string
               or None, and "run": {"job", "requested_at"} from the Updates page's Run now, or None
    Returns a list of (job, reason), plus the state keys to stamp, in a dict.
    """
    settings = {**DEFAULTS, **settings}
    paused = settings["paused"]
    now = now.astimezone(CENTRAL)
    slate = slate_date(now).isoformat()
    jobs, marks = [], {}

    # Sync Now from the website
    requested = settings.get("sync_now")
    if requested and requested != state.get("sync_now_handled"):
        jobs.append(("quick", "Sync Now pressed on the website"))
        marks["sync_now_handled"] = requested

    # Run now on the Updates page (runs even when that job's schedule is paused)
    run = settings.get("run") or {}
    if run.get("job") in JOBS and run.get("requested_at") and run["requested_at"] != state.get("run_handled"):
        jobs.append((run["job"], "Run now on the Updates page"))
        marks["run_handled"] = run["requested_at"]

    # ESPN moves (the job itself only writes when something changed)
    last = when(state, "moves_checked")
    if "moves" not in paused and (
            not last or now - last >= timedelta(minutes=settings["moves_every"]) - timedelta(seconds=20)):
        jobs.append(("check_moves", "move check"))
        marks["moves_checked"] = now.isoformat()

    # Game-time stats (tips from another game date are ignored)
    tips = [t for t in tips if slate_date(t).isoformat() == slate]
    if tips:
        first_tip = tips[0]
        in_window = first_tip <= now < first_tip + MAX_GAME_WINDOW
        finished = state.get("final_slate") == slate
        if in_window and not finished and "stats" not in paused:
            last = when(state, "stats_run")
            if not last or now - last >= timedelta(minutes=settings["stats_every"]) - timedelta(seconds=20):
                jobs.append(("stats", "games in progress"))
                marks["stats_run"] = now.isoformat()
            if all_final:
                marks["final_slate"] = slate
                marks["final_at"] = now.isoformat()
        elif now >= first_tip + MAX_GAME_WINDOW and not finished:
            marks["final_slate"] = slate          # a game never reported final: stop anyway
            marks["final_at"] = now.isoformat()

    # Post-game: 30 minutes after the slate went final
    final_at = when(state, "final_at")
    delay = settings["postgame_delay"]
    if (state.get("final_slate") == slate and final_at and now - final_at >= timedelta(minutes=delay)
            and state.get("postgame_slate") != slate and "postgame" not in paused):
        jobs.append(("postgame", f"{delay} min after the last game"))
        marks["postgame_slate"] = slate

    # Nightly, 6-8am by default. Last night's slate is yesterday's game date.
    today = now.date().isoformat()
    last_night = (now.date() - timedelta(days=1)).isoformat()
    start = settings["nightly_hour"]
    if (start <= now.hour < start + NIGHTLY_HOURS and state.get("nightly_day") != today
            and "nightly" not in paused):
        if state.get("postgame_slate") == last_night:
            marks["nightly_day"] = today
            marks["nightly_skipped"] = "post-game run already covered last night"
        else:
            tried = when(state, "nightly_tried")
            if not tried or now - tried >= NIGHTLY_RETRY:
                jobs.append(("nightly", "morning run"))
                marks["nightly_tried"] = now.isoformat()
    return {"jobs": jobs, "marks": marks, "slate": slate}


# ---------------------------------------------------------------- doing

def log_path(now):
    folder = HERE / "logs"
    folder.mkdir(exist_ok=True)
    return folder / f"runner-{now:%Y-%m-%d}.log"


def log(now, text):
    with open(log_path(now), "a", encoding="utf-8") as f:
        f.write(f"[{datetime.now(CENTRAL):%H:%M:%S}] {text}\n")


def run_script(now, args):
    log(now, "$ " + " ".join(args))
    with open(log_path(now), "a", encoding="utf-8") as f:
        result = subprocess.run([PY, *args], cwd=HERE, stdout=f, stderr=subprocess.STDOUT, timeout=1800)
    if result.returncode:
        log(now, f"  exit code {result.returncode}")
    return result.returncode == 0


def run_heat(now):
    """Heat rankings: build_model.py + publish, once BUILD_MODEL_DIR is set in .env."""
    folder = os.environ.get("BUILD_MODEL_DIR")
    if not folder:
        log(now, "heat rankings: skipped (set BUILD_MODEL_DIR in .env once build_model.py reads this season)")
        return True
    ok = run_script(now, [str(Path(folder) / "build_model.py")])
    return run_script(now, ["publish_rankings.py", folder]) and ok


def run_job(now, job, slate):
    log(now, f"== {job}")
    ok = True
    last_night = (date.fromisoformat(slate) - timedelta(days=1)).isoformat()
    for step in JOBS[job]:
        if step == "heat":
            ok = run_heat(now) and ok
        else:
            args = [part.replace("{slate}", slate).replace("{last_night}", last_night) for part in step]
            ok = run_script(now, args) and ok
    log(now, f"== {job} {'done' if ok else 'finished with errors'}")
    return ok


def espn_fingerprint():
    """One ESPN request: every team's roster and slots, plus the newest activity id.
    Changes whenever a player is added, dropped, traded or moved to/from IR or the bench."""
    from espn_api.requests.espn_requests import EspnFantasyRequests
    req = EspnFantasyRequests("nba", int(os.environ["ESPN_YEAR"]), int(os.environ["ESPN_LEAGUE_ID"]),
                              cookies={"espn_s2": os.environ["ESPN_S2"], "SWID": os.environ["ESPN_SWID"]})
    data = req.league_get(params={"view": ["mRoster"]})
    rosters = sorted((t["id"], e["playerId"], e["lineupSlotId"])
                     for t in data.get("teams", []) for e in t.get("roster", {}).get("entries", []))
    filters = {"topics": {"filterType": {"value": ["ACTIVITY_TRANSACTIONS"]}, "limit": 1,
                          "sortMessageDate": {"sortPriority": 1, "sortAsc": False}}}
    activity = req.league_get(extend="/communication/", params={"view": "kona_league_communication"},
                              headers={"x-fantasy-filter": json.dumps(filters)})
    newest = [t.get("id") for t in activity.get("topics", [])[:1]]
    return hashlib.sha256(json.dumps([rosters, newest]).encode()).hexdigest()


def check_moves(now, state):
    try:
        fingerprint = espn_fingerprint()
    except Exception as e:                        # ESPN down or cookies expired: try again next time
        log(now, f"move check failed: {e!r}")
        return
    if fingerprint != state.get("espn_fingerprint"):
        if state.get("espn_fingerprint"):
            log(now, "ESPN roster or transaction change seen")
        ok = run_job(now, "moves", slate_date(now).isoformat())
        record(state, "moves", now, ok, "ESPN roster or transaction change")
        if ok:
            state["espn_fingerprint"] = fingerprint   # on failure, retried at the next check
        return True
    return False


def record(state, job, started, ok, why):
    """Last run of each job, for `status` and the Updates page."""
    state.setdefault("last_runs", {})[job] = {"at": started.isoformat(), "ok": ok, "why": why}


def site_request(path, body=None):
    site = os.environ.get("SITE_URL", "").rstrip("/")
    if not site:
        return None
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(site + path, data=data, method="POST" if data else "GET",
                                 headers={"content-type": "application/json", "user-agent": "beer-league-pc"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read() or b"{}")


def site_state(now):
    """What the website holds: Sync Now presses, plus (v2 sites) the schedule and Run now requests."""
    try:
        return (site_request("/api/sync-now") or {}).get("data") or {}
    except Exception as e:
        log(now, f"Sync Now check failed: {e!r}")
        return {}


def sync_now_requested(site):
    requested, done = site.get("requested_at"), site.get("done_at")
    return requested if requested and (not done or requested > done) else None


def current_settings(state, site):
    """DEFAULTS, then `moves-every` from this PC, then the Updates page's schedule."""
    return {**DEFAULTS, "moves_every": int(state.get("moves_every", DEFAULTS["moves_every"])),
            **clean_schedule(site.get("schedule"))}


def report(now, state, site, settings, force=False):
    """Tell the Updates page what ran and when. Only a site that understands it (v2) gets it:
    an older site would read the post as a Sync Now press. Sent when something ran, else every
    15 minutes as a heartbeat (each one is a Cloudflare KV write, so not every minute)."""
    if (site.get("v") or 0) < 2:
        return
    last = when(state, "reported_at")
    if not force and last and now - last < REPORT_EVERY:
        return
    slate = slate_date(now)
    status = {key: state.get(key) for key in ("last_runs", "moves_checked", "stats_run", "final_slate", "final_at",
                                              "postgame_slate", "nightly_day", "nightly_skipped", "run_handled")}
    status.update(seen_at=now.isoformat(), slate=slate.isoformat(), tips=[t.isoformat() for t in load_slate(slate)],
                  all_final=slate_final(slate),
                  schedule={k: settings[k] for k in DEFAULTS}, jobs=sorted(JOBS))
    try:
        site_request("/api/sync-now", {"status": status})
        state["reported_at"] = now.isoformat()
    except Exception as e:
        log(now, f"Updates page report failed: {e!r}")


def acquire_lock(now):
    CACHE.mkdir(exist_ok=True)
    try:
        held = datetime.fromisoformat(LOCK_FILE.read_text())
        if now - held < LOCK_STALE:
            return False
    except (OSError, ValueError):
        pass
    LOCK_FILE.write_text(now.isoformat())
    return True


def tick():
    now = datetime.now(CENTRAL)
    if not acquire_lock(now):
        return                                    # the previous run is still going
    try:
        state = load_state()
        slate = slate_date(now)
        site = site_state(now)
        settings = current_settings(state, site)
        result = plan(now, state, load_slate(slate), slate_final(slate),
                      {**settings, "sync_now": sync_now_requested(site), "run": site.get("run")})
        # stamp first, so a crash in a job doesn't make it repeat every minute
        state.update(result["marks"])
        save_state(state)
        ran = False
        for job, reason in result["jobs"]:
            if job == "check_moves":
                ran = check_moves(now, state) or ran
                continue
            log(now, f"{job}: {reason}")
            started = datetime.now(CENTRAL)
            ok = run_job(now, job, result["slate"])
            record(state, job, started, ok, reason)
            ran = True
            if job == "nightly" and ok:
                state["nightly_day"] = now.date().isoformat()
            if job == "quick":
                try:
                    site_request("/api/sync-now", {"done_at": datetime.now(CENTRAL).isoformat(),
                                                   "requested_at": sync_now_requested(site), "ok": ok})
                except Exception as e:
                    log(now, f"Sync Now reply failed: {e!r}")
            if job == "stats":                    # the stats job refreshed today.json
                if slate_final(slate) and state.get("final_slate") != result["slate"]:
                    state["final_slate"] = result["slate"]
                    state["final_at"] = datetime.now(CENTRAL).isoformat()
            save_state(state)
        report(datetime.now(CENTRAL), state, site, settings, force=ran or "run_handled" in result["marks"])
        save_state(state)
    finally:
        LOCK_FILE.unlink(missing_ok=True)


def status():
    now = datetime.now(CENTRAL)
    state = load_state()
    slate = slate_date(now)
    tips = load_slate(slate)
    print(f"now {now:%a %b %d %H:%M} Central; game date {slate}; "
          f"{len(tips)} games, first tip {tips[0]:%H:%M} " if tips else f"now {now:%H:%M}; no games on {slate}")
    s = current_settings(state, site_state(now))
    print(f"ESPN move checks every {s['moves_every']} min; stats every {s['stats_every']} min during games; "
          f"post-game {s['postgame_delay']} min after the last game; morning run from {s['nightly_hour']}:00"
          + (f"; paused: {', '.join(s['paused'])}" if s["paused"] else ""))
    for key in ("moves_checked", "stats_run", "final_slate", "final_at", "postgame_slate", "nightly_day",
                "nightly_tried", "nightly_skipped", "sync_now_handled", "run_handled"):
        print(f"  {key:17} {state.get(key, '-')}")
    for job, last in sorted(state.get("last_runs", {}).items()):
        print(f"  last {job:12} {last['at']}  {'ok' if last['ok'] else 'ERRORS'}  ({last['why']})")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("tick")
    sub.add_parser("status")
    m = sub.add_parser("moves-every")
    m.add_argument("minutes", type=int, choices=[1, 15])
    r = sub.add_parser("run")
    r.add_argument("job", choices=sorted(JOBS))
    sub.add_parser("install")
    args = parser.parse_args()

    if args.command == "tick":
        tick()
    elif args.command == "status":
        status()
    elif args.command == "moves-every":
        state = load_state()
        state["moves_every"] = args.minutes
        save_state(state)
        print(f"ESPN move checks: every {args.minutes} min")
        if "moves_every" in clean_schedule(site_state(datetime.now(CENTRAL)).get("schedule")):
            print("Note: the Updates page has its own setting for this, and it wins. Change it there.")
    elif args.command == "run":
        now = datetime.now(CENTRAL)
        state = load_state()
        slate = slate_date(now)
        ok = run_job(now, args.job, slate.isoformat())
        state = load_state()                      # the minute check may have saved while this ran
        record(state, args.job, now, ok, "run by hand")
        # a manual run after the last game counts as the post-game run, so the 6am run is skipped
        final_at = when(state, "final_at")
        site = site_state(now)
        settings = current_settings(state, site)
        if args.job in ("postgame", "nightly") and ok:
            if (state.get("final_slate") == slate.isoformat() and final_at
                    and now - final_at >= timedelta(minutes=settings["postgame_delay"])):
                state["postgame_slate"] = slate.isoformat()
            if args.job == "nightly":
                state["nightly_day"] = now.date().isoformat()
        report(datetime.now(CENTRAL), state, site, settings, force=True)
        save_state(state)
        print(f"{args.job}: {'done' if ok else 'finished with errors'} (details in {log_path(now)})")
    elif args.command == "install":
        pyw = Path(PY).with_name("pythonw.exe")
        print("Run this once in PowerShell (it repeats every minute, hidden, while you're logged in):\n")
        print(f'$a = New-ScheduledTaskAction -Execute "{pyw}" -Argument \'"{HERE / "sync_runner.py"}" tick\' '
              f'-WorkingDirectory "{HERE}"')
        print("$t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)")
        print("$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries "
              "-MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)")
        print('Register-ScheduledTask -TaskName "Beer League Sync" -Action $a -Trigger $t -Settings $s')


if __name__ == "__main__":
    main()
