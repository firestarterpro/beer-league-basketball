"""Decides when each league sync runs. Task Scheduler starts it every minute.

    python sync_runner.py tick                 # what Task Scheduler runs; usually does nothing
    python sync_runner.py status               # what ran last and what's next
    python sync_runner.py moves-every 15       # ESPN move checks: every 1 or 15 minutes
    python sync_runner.py run nightly          # run a job by hand (nightly, postgame, stats, moves, quick)
    python sync_runner.py install              # print the Task Scheduler command

Schedule (Central time):
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

STAT_EVERY = timedelta(minutes=17)
POSTGAME_DELAY = timedelta(minutes=30)
NIGHTLY_START, NIGHTLY_END = 6, 8          # hours, Central
NIGHTLY_RETRY = timedelta(minutes=15)
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
}


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
    settings   {"moves_every": minutes, "sync_now": requested-at iso string or None}
    Returns a list of (job, reason), plus the state keys to stamp, in a dict.
    """
    now = now.astimezone(CENTRAL)
    slate = slate_date(now).isoformat()
    jobs, marks = [], {}

    # Sync Now from the website
    requested = settings.get("sync_now")
    if requested and requested != state.get("sync_now_handled"):
        jobs.append(("quick", "Sync Now pressed on the website"))
        marks["sync_now_handled"] = requested

    # ESPN moves (the job itself only writes when something changed)
    last = when(state, "moves_checked")
    if not last or now - last >= timedelta(minutes=settings.get("moves_every", 1)) - timedelta(seconds=20):
        jobs.append(("check_moves", "move check"))
        marks["moves_checked"] = now.isoformat()

    # Game-time stats (tips from another game date are ignored)
    tips = [t for t in tips if slate_date(t).isoformat() == slate]
    if tips:
        first_tip = tips[0]
        in_window = first_tip <= now < first_tip + MAX_GAME_WINDOW
        finished = state.get("final_slate") == slate
        if in_window and not finished:
            last = when(state, "stats_run")
            if not last or now - last >= STAT_EVERY - timedelta(seconds=20):
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
    if (state.get("final_slate") == slate and final_at and now - final_at >= POSTGAME_DELAY
            and state.get("postgame_slate") != slate):
        jobs.append(("postgame", "30 min after the last game"))
        marks["postgame_slate"] = slate

    # Nightly, 6-8am. Last night's slate is yesterday's game date.
    today = now.date().isoformat()
    last_night = (now.date() - timedelta(days=1)).isoformat()
    if NIGHTLY_START <= now.hour < NIGHTLY_END and state.get("nightly_day") != today:
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
        if run_job(now, "moves", slate_date(now).isoformat()):
            state["espn_fingerprint"] = fingerprint   # on failure, retried at the next check


def site_request(path, body=None):
    site = os.environ.get("SITE_URL", "").rstrip("/")
    if not site:
        return None
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(site + path, data=data, method="POST" if data else "GET",
                                 headers={"content-type": "application/json", "user-agent": "beer-league-pc"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read() or b"{}")


def sync_now_requested(now):
    try:
        state = (site_request("/api/sync-now") or {}).get("data") or {}
        requested, done = state.get("requested_at"), state.get("done_at")
        return requested if requested and (not done or requested > done) else None
    except Exception as e:
        log(now, f"Sync Now check failed: {e!r}")
        return None


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
        settings = {"moves_every": int(state.get("moves_every", 1)), "sync_now": sync_now_requested(now)}
        result = plan(now, state, load_slate(slate), slate_final(slate), settings)
        # stamp first, so a crash in a job doesn't make it repeat every minute
        state.update(result["marks"])
        save_state(state)
        for job, reason in result["jobs"]:
            if job == "check_moves":
                check_moves(now, state)
                continue
            log(now, f"{job}: {reason}")
            ok = run_job(now, job, result["slate"])
            if job == "nightly" and ok:
                state["nightly_day"] = now.date().isoformat()
            if job == "quick":
                try:
                    site_request("/api/sync-now", {"done_at": datetime.now(CENTRAL).isoformat(),
                                                   "requested_at": settings["sync_now"], "ok": ok})
                except Exception as e:
                    log(now, f"Sync Now reply failed: {e!r}")
            if job == "stats":                    # the stats job refreshed today.json
                if slate_final(slate) and state.get("final_slate") != result["slate"]:
                    state["final_slate"] = result["slate"]
                    state["final_at"] = datetime.now(CENTRAL).isoformat()
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
    print(f"ESPN move checks every {state.get('moves_every', 1)} min")
    for key in ("moves_checked", "stats_run", "final_slate", "final_at", "postgame_slate", "nightly_day",
                "nightly_tried", "nightly_skipped", "sync_now_handled"):
        print(f"  {key:17} {state.get(key, '-')}")


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
    elif args.command == "run":
        now = datetime.now(CENTRAL)
        state = load_state()
        slate = slate_date(now)
        ok = run_job(now, args.job, slate.isoformat())
        # a manual run after the last game counts as the post-game run, so the 6am run is skipped
        final_at = when(state, "final_at")
        if args.job in ("postgame", "nightly") and ok:
            if state.get("final_slate") == slate.isoformat() and final_at and now - final_at >= POSTGAME_DELAY:
                state["postgame_slate"] = slate.isoformat()
            if args.job == "nightly":
                state["nightly_day"] = now.date().isoformat()
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
