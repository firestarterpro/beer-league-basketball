"""NBA.com -> Neon sync: hustle and defensive tracking stats for power rankings.

Runs on the LM's PC (stats.nba.com blocks cloud servers). Uses the same
.env as espn_sync.py.

    python nba_sync.py games                      # yesterday's finished games
    python nba_sync.py games --date 2026-11-02
    python nba_sync.py games --from 2026-10-21 --to 2026-11-02   # backfill a range
    python nba_sync.py link                       # match NBA person ids to ESPN players by name
    python nba_sync.py link --dry-run             # show what would link and what doesn't, write nothing
    python nba_sync.py schedule                   # whole season's games and tip times
    python nba_sync.py today                      # live status and scores for today's games
"""

import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from nba_api.stats.endpoints import (
    BoxScoreDefensiveV2, BoxScoreHustleV2, BoxScorePlayerTrackV3, BoxScoreTraditionalV3, CommonAllPlayers,
    ScheduleLeagueV2, ScoreboardV3,
)
from nba_api.stats.static import players as static_players

from power_tiers import norm      # the same name rules as the database's norm_name()

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")
PAUSE = 0.8          # seconds between stats.nba.com calls, to stay polite
FINAL = 3            # ScoreboardV3 gameStatus for a finished game
# A local copy of the schedule, so the update scheduler can check tip times without waking Neon.
SCHEDULE_CACHE = HERE / "raw_cache" / "schedule.json"
TODAY_CACHE = HERE / "raw_cache" / "today.json"      # last live status per game, for the same reason
# NBA game ids start with a type code: 001 preseason, 002 regular season, 004 playoffs, 005 play-in, 006 NBA Cup final
SEASON_TYPES = {"001": "Preseason", "002": "Regular Season", "004": "Playoffs", "005": "Play-In", "006": "NBA Cup"}


def connect_db():
    url = os.environ.get("DATABASE_URL") or sys.exit("Missing DATABASE_URL in sync/.env")
    return psycopg.connect(url)


def minutes(value):
    """'34:12' or 'PT34M12.00S' -> 34.2"""
    if not value:
        return 0.0
    value = str(value)
    if value.startswith("PT"):
        m, _, rest = value[2:].partition("M")
        return float(m or 0) + float(rest.rstrip("S") or 0) / 60
    if ":" in value:
        m, s = value.split(":")
        return float(m) + float(s) / 60
    return float(value)


def rows(endpoint):
    return endpoint.player_stats.get_dict()["data"], endpoint.player_stats.get_dict()["headers"]


def by_person(endpoint):
    data, headers = rows(endpoint)
    out = {}
    for row in data:
        rec = dict(zip(headers, row))
        out[rec["personId"]] = rec
    return out


def fetch_game(game_id):
    hustle = by_person(BoxScoreHustleV2(game_id=game_id)); time.sleep(PAUSE)
    defense = by_person(BoxScoreDefensiveV2(game_id=game_id)); time.sleep(PAUSE)
    track = by_person(BoxScorePlayerTrackV3(game_id=game_id)); time.sleep(PAUSE)
    trad = by_person(BoxScoreTraditionalV3(game_id=game_id)); time.sleep(PAUSE)
    for pid, t in trad.items():
        h, d, k = hustle.get(pid, {}), defense.get(pid, {}), track.get(pid, {})
        yield {
            "nba_person_id": pid,
            "name": f"{t.get('firstName', '')} {t.get('familyName', '')}".strip(),
            "minutes": minutes(t.get("minutes")),
            "deflections": h.get("deflections"),
            "contested_shots": h.get("contestedShots"),
            "charges_drawn": h.get("chargesDrawn"),
            "box_outs": h.get("boxOuts"),
            "loose_balls": h.get("looseBallsRecoveredTotal"),
            "dfg_made": d.get("matchupFieldGoalsMade"),
            "dfg_attempted": d.get("matchupFieldGoalsAttempted"),
            "rim_dfg_made": k.get("defendedAtRimFieldGoalsMade"),
            "rim_dfg_attempted": k.get("defendedAtRimFieldGoalsAttempted"),
        }


def sync_day(conn, day, new_only=False):
    board = ScoreboardV3(game_date=day.isoformat()).game_header.get_dict()
    headers = board["headers"]
    games = [dict(zip(headers, r)) for r in board["data"]]
    done = [g["gameId"] for g in games if g.get("gameStatus") == FINAL]
    if new_only:                        # skip games already loaded (the game-time runs repeat every 17 min)
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT game_id FROM nba_tracking_games WHERE game_date = %s", (day,))
            loaded = {r[0] for r in cur.fetchall()}
        done = [g for g in done if g not in loaded]
    time.sleep(PAUSE)
    count = 0
    with conn.cursor() as cur:
        for game_id in done:
            for rec in fetch_game(game_id):
                if rec["minutes"] <= 0:
                    continue                    # DNP
                cur.execute(
                    """INSERT INTO nba_tracking_games (nba_person_id, game_id, game_date, minutes, deflections,
                           contested_shots, charges_drawn, box_outs, loose_balls,
                           dfg_made, dfg_attempted, rim_dfg_made, rim_dfg_attempted)
                       VALUES (%(nba_person_id)s, %(game_id)s, %(game_date)s, %(minutes)s, %(deflections)s,
                           %(contested_shots)s, %(charges_drawn)s, %(box_outs)s, %(loose_balls)s,
                           %(dfg_made)s, %(dfg_attempted)s, %(rim_dfg_made)s, %(rim_dfg_attempted)s)
                       ON CONFLICT (nba_person_id, game_id) DO UPDATE SET
                           minutes = EXCLUDED.minutes, deflections = EXCLUDED.deflections,
                           contested_shots = EXCLUDED.contested_shots, charges_drawn = EXCLUDED.charges_drawn,
                           box_outs = EXCLUDED.box_outs, loose_balls = EXCLUDED.loose_balls,
                           dfg_made = EXCLUDED.dfg_made, dfg_attempted = EXCLUDED.dfg_attempted,
                           rim_dfg_made = EXCLUDED.rim_dfg_made, rim_dfg_attempted = EXCLUDED.rim_dfg_attempted""",
                    {**rec, "game_id": game_id, "game_date": day},
                )
                cur.execute("""INSERT INTO nba_people (nba_person_id, name) VALUES (%s, %s)
                               ON CONFLICT (nba_person_id) DO NOTHING""", (rec["nba_person_id"], rec["name"]))
                count += 1
    conn.commit()
    print(f"{day}: {len(done)} final games, {count} player lines")


def current_season(today=None):
    today = today or date.today()
    start = today.year if today.month >= 7 else today.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def utc(value):
    """'2026-10-21T23:30:00Z' -> aware datetime; blank or midnight placeholder -> None"""
    if not value:
        return None
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def parse_schedule(data, season):
    """ScheduleLeagueV2 SeasonGames rows -> games rows"""
    out = []
    for g in (dict(zip(data["headers"], r)) for r in data["data"]):
        if not g.get("homeTeam_teamTricode") or not g.get("awayTeam_teamTricode"):
            continue                    # bracket slots with no teams yet
        game_id = str(g["gameId"])
        out.append({
            "game_id": game_id,
            "season": season,
            "game_date": str(g.get("gameDateEst") or g["gameDate"])[:10],
            "tip_utc": utc(g.get("gameDateTimeUTC")),
            "home_team": g["homeTeam_teamTricode"],
            "away_team": g["awayTeam_teamTricode"],
            "season_type": SEASON_TYPES.get(game_id[:3], "Other"),
            "status": int(g.get("gameStatus") or 1),
            "status_text": (g.get("gameStatusText") or "").strip() or None,
            "home_score": g.get("homeTeam_score") if int(g.get("gameStatus") or 1) > 1 else None,
            "away_score": g.get("awayTeam_score") if int(g.get("gameStatus") or 1) > 1 else None,
            "postponed": str(g.get("postponedStatus") or "").upper() in ("Y", "P", "TRUE"),
        })
    return out


UPSERT_GAME = """
    INSERT INTO games (game_id, season, game_date, tip_utc, home_team, away_team, season_type,
                       status, status_text, home_score, away_score, postponed)
    VALUES (%(game_id)s, %(season)s, %(game_date)s, %(tip_utc)s, %(home_team)s, %(away_team)s, %(season_type)s,
            %(status)s, %(status_text)s, %(home_score)s, %(away_score)s, %(postponed)s)
    ON CONFLICT (game_id) DO UPDATE SET
        game_date = EXCLUDED.game_date, tip_utc = EXCLUDED.tip_utc, home_team = EXCLUDED.home_team,
        away_team = EXCLUDED.away_team, season_type = EXCLUDED.season_type, status = EXCLUDED.status,
        status_text = EXCLUDED.status_text, home_score = EXCLUDED.home_score,
        away_score = EXCLUDED.away_score, postponed = EXCLUDED.postponed
    WHERE (games.tip_utc, games.status, games.status_text, games.home_score, games.away_score, games.postponed,
           games.game_date)
          IS DISTINCT FROM (EXCLUDED.tip_utc, EXCLUDED.status, EXCLUDED.status_text, EXCLUDED.home_score,
           EXCLUDED.away_score, EXCLUDED.postponed, EXCLUDED.game_date)
"""


def save_schedule_cache(games):
    SCHEDULE_CACHE.parent.mkdir(exist_ok=True)
    SCHEDULE_CACHE.write_text(json.dumps(
        [{"game_id": g["game_id"], "game_date": g["game_date"],
          "tip_utc": g["tip_utc"].isoformat() if g["tip_utc"] else None} for g in games], indent=0))


def cmd_schedule(conn, season):
    games = parse_schedule(ScheduleLeagueV2(season=season).season_games.get_dict(), season)
    with conn.cursor() as cur:
        cur.executemany(UPSERT_GAME, games)
    conn.commit()
    save_schedule_cache(games)
    print(f"{season}: {len(games)} games saved ({sum(1 for g in games if g['tip_utc'])} with tip times)")


def parse_scoreboard(header, line_score, teams_by_game):
    """ScoreboardV3 game_header + line_score -> games updates.
    teams_by_game maps game_id -> (home tricode, away tricode) from the games table."""
    scores = {}
    for r in (dict(zip(line_score["headers"], r)) for r in line_score["data"]):
        scores.setdefault(r["gameId"], {})[r["teamTricode"]] = r.get("score")
    out = []
    for g in (dict(zip(header["headers"], r)) for r in header["data"]):
        if g["gameId"] not in teams_by_game:
            continue                    # not in the schedule yet; `schedule` picks it up
        home, away = teams_by_game[g["gameId"]]
        status = int(g.get("gameStatus") or 1)
        game_scores = scores.get(g["gameId"], {})
        out.append({
            "game_id": g["gameId"], "status": status,
            "status_text": (g.get("gameStatusText") or "").strip() or None,
            "home_score": game_scores.get(home) if status > 1 else None,
            "away_score": game_scores.get(away) if status > 1 else None,
        })
    return out


def cmd_today(conn, day):
    board = ScoreboardV3(game_date=day.isoformat())
    with conn.cursor() as cur:
        cur.execute("SELECT game_id, home_team, away_team FROM games WHERE game_date = %s", (day,))
        teams_by_game = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
        updates = parse_scoreboard(board.game_header.get_dict(), board.line_score.get_dict(), teams_by_game)
        cur.executemany(
            """UPDATE games SET status = %(status)s, status_text = %(status_text)s,
                   home_score = %(home_score)s, away_score = %(away_score)s
               WHERE game_id = %(game_id)s AND (status, status_text, home_score, away_score)
                     IS DISTINCT FROM (%(status)s::smallint, %(status_text)s::text,
                                       %(home_score)s::integer, %(away_score)s::integer)""",
            updates)
    conn.commit()
    TODAY_CACHE.parent.mkdir(exist_ok=True)
    TODAY_CACHE.write_text(json.dumps({"date": day.isoformat(), "checked": datetime.now().isoformat(),
                                       "games": {u["game_id"]: u["status"] for u in updates}}))
    live = sum(1 for u in updates if u["status"] == 2)
    final = sum(1 for u in updates if u["status"] == FINAL)
    print(f"{day}: {len(updates)} games, {live} in progress, {final} final")


# ---------- link: NBA.com person ids onto ESPN players ----------
# The two sites mostly spell names the same. When they don't, it's punctuation or a suffix
# ("P.J." / "PJ", "Jimmy Butler III"), the name order ("Cui Yongxi"), or a nickname
# ("Nic Claxton" / "Nicolas Claxton"). Nicknames only count when the last name and NBA team match too.
NICKNAMES = {frozenset(pair) for pair in [       # beyond the ones a prefix or initials already catch
    ("bones", "nahshon"), ("bub", "carlton"), ("moe", "moritz"), ("nick", "nicholas"), ("mike", "michael"),
    ("nate", "nathan"), ("bob", "robert"), ("bill", "william"), ("jimmy", "james"), ("ben", "benjamin"),
]}
ESPN_TEAM_FIX = {"PHL": "PHI", "PHO": "PHX"}    # ESPN -> NBA tricode, the same as nba_tricode() in the database


def first_names_match(a, b):
    """'nic' / 'nicolas' (prefix), 'kj' / 'kenyon' (initials), 'bones' / 'nahshon' (NICKNAMES)."""
    short, long_ = sorted((a, b), key=len)
    return long_.startswith(short) or (len(short) <= 2 and short[0] == long_[0]) or frozenset((a, b)) in NICKNAMES


def parse_roster(data):
    """CommonAllPlayers rows -> [(nba_person_id, name, team tricode or '')]"""
    recs = (dict(zip(data["headers"], r)) for r in data["data"])
    return [(int(r["PERSON_ID"]), r["DISPLAY_FIRST_LAST"], r.get("TEAM_ABBREVIATION") or "") for r in recs
            if r.get("PERSON_ID") and r.get("DISPLAY_FIRST_LAST")]


def nba_roster(season):
    """Everyone on an NBA roster this season, with their team. If stats.nba.com doesn't answer,
    nba_api's built-in list of active players (no teams, so only exact names link)."""
    try:
        people = parse_roster(CommonAllPlayers(is_only_current_season=1, season=season, timeout=60)
                              .common_all_players.get_dict())
        if people:
            return people
    except Exception as e:                      # any failure (timeout, block, odd JSON) falls back the same way
        print(f"stats.nba.com player list failed ({e}); using nba_api's built-in list")
    return [(p["id"], p["full_name"], "") for p in static_players.get_active_players()]


def match_people(players, people, taken=()):
    """Pair ESPN players with NBA.com people.

    players  [(player_id, name, espn team abbreviation or None)] still without an NBA id
    people   [(nba_person_id, name, team tricode or '')]
    taken    NBA ids already on another player (never reused)
    Returns ({player_id: (nba_person_id, how)}, [(name, team, why)] unmatched). Passes, strictest first:
    exact name, the same words in another order, then same team + last name + matching first name.
    An NBA id goes to one player at most; if two players want the same id, neither gets it.
    """
    everyone = {pid: (norm(name), team) for pid, name, team in people}
    free = set(everyone) - set(taken)
    todo = {player_id: (norm(name), ESPN_TEAM_FIX.get((team or "").upper(), (team or "").upper()), name)
            for player_id, name, team in players}
    links, why = {}, {}

    def run(how, fits):
        wants = {}
        for player_id, (key, team, _) in todo.items():
            if player_id in links:
                continue
            # Judge against every NBA player, linked or not, so a shared name stays ambiguous
            # even after one of its owners has been linked.
            hits = [pid for pid, (pkey, pteam) in everyone.items() if fits(key, team, pkey, pteam)]
            if len(hits) > 1:                   # the same name twice: the NBA team decides
                same_team = [pid for pid in hits if team and everyone[pid][1] == team]
                if len(same_team) != 1:
                    why[player_id] = f"{len(hits)} NBA players fit"
                    continue
                hits = same_team
            if hits and hits[0] not in free:
                why[player_id] = "that NBA player is already on another ESPN player"
            elif hits:
                wants.setdefault(hits[0], []).append(player_id)
        for pid, who in wants.items():
            if len(who) == 1:
                links[who[0]] = (pid, how)
                free.discard(pid)
            else:
                for player_id in who:
                    why[player_id] = "another ESPN player fits the same NBA player"

    # The later passes only look at names that differ, so a name that was ambiguous in the first
    # pass isn't settled by elimination afterwards.
    run("name", lambda key, team, pkey, pteam: key == pkey)
    run("name order", lambda key, team, pkey, pteam: key != pkey and sorted(key.split()) == sorted(pkey.split()))

    def nickname(key, team, pkey, pteam):
        a, b = key.split(), pkey.split()
        return (key != pkey and bool(team) and team == pteam and len(a) > 1 and len(b) > 1 and a[-1] == b[-1]
                and first_names_match(a[0], b[0]))
    run("nickname", nickname)

    unmatched = [(name, team, why.get(player_id, "no NBA.com match"))
                 for player_id, (key, team, name) in todo.items() if player_id not in links]
    return links, unmatched


def link(cur, people):
    """Write NBA ids onto players that have none. Returns match_people's (links, unmatched) and
    {nba_person_id: name} for everyone it looked at."""
    cur.executemany("""INSERT INTO nba_people (nba_person_id, name) VALUES (%s, %s)
                       ON CONFLICT (nba_person_id) DO NOTHING""", [(pid, name) for pid, name, _ in people])
    # Box-score names fill in anyone the roster list missed (no team for them).
    cur.execute("SELECT nba_person_id, name FROM nba_people")
    known = {pid for pid, _, _ in people}
    people = list(people) + [(pid, name, "") for pid, name in cur.fetchall() if pid not in known]
    cur.execute("SELECT nba_person_id FROM players WHERE nba_person_id IS NOT NULL")
    taken = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT player_id, name, nba_team FROM players WHERE nba_person_id IS NULL ORDER BY name")
    links, unmatched = match_people(cur.fetchall(), people, taken)
    cur.executemany("UPDATE players SET nba_person_id = %s WHERE player_id = %s AND nba_person_id IS NULL",
                    [(pid, player_id) for player_id, (pid, _) in links.items()])
    return links, unmatched, {pid: name for pid, name, _ in people}


def cmd_link(conn, season, dry_run=False):
    people = nba_roster(season)
    with conn.cursor() as cur:
        links, unmatched, nba_names = link(cur, people)
        cur.execute("SELECT count(*), count(nba_person_id) FROM players")
        total, with_id = cur.fetchone()
        cur.execute("SELECT player_id, name FROM players")
        names = dict(cur.fetchall())
    if dry_run:
        conn.rollback()
    else:
        conn.commit()
    hows = {}
    for _, how in links.values():
        hows[how] = hows.get(how, 0) + 1
    print(f"{'would link' if dry_run else 'linked'} {len(links)} players "
          f"({', '.join(f'{n} by {h}' for h, n in hows.items()) or 'none'}); "
          f"{with_id} of {total} players have an NBA id{' after this' if dry_run else ''}. "
          f"NBA.com list: {len(people)} people.")
    for player_id, (pid, how) in links.items():
        if how != "name":                       # the looser matches, to eyeball
            print(f"   {how:10s} {names.get(player_id)} -> {nba_names.get(pid, pid)} ({pid})")
    print(f"{len(unmatched)} without a match (free agents off every NBA roster are expected here):")
    for name, team, why in unmatched[:60]:
        print(f"   {name} ({team or 'FA'}): {why}")
    if dry_run:
        print("Dry run: nothing written.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    g = sub.add_parser("games")
    g.add_argument("--date", type=date.fromisoformat)
    g.add_argument("--from", dest="start", type=date.fromisoformat)
    g.add_argument("--to", dest="end", type=date.fromisoformat)
    g.add_argument("--new-only", action="store_true", help="skip games already loaded")
    k = sub.add_parser("link")
    k.add_argument("--season", default=current_season(), help="e.g. 2026-27 (default: this season)")
    k.add_argument("--dry-run", action="store_true", help="show what would link, write nothing")
    s = sub.add_parser("schedule")
    s.add_argument("--season", default=current_season(), help="e.g. 2026-27 (default: this season)")
    s = sub.add_parser("today")
    s.add_argument("--date", type=date.fromisoformat, default=date.today())
    args = parser.parse_args()

    conn = connect_db()
    if args.command == "link":
        return cmd_link(conn, args.season, args.dry_run)
    if args.command == "schedule":
        return cmd_schedule(conn, args.season)
    if args.command == "today":
        return cmd_today(conn, args.date)
    if args.start:
        day, end = args.start, args.end or date.today() - timedelta(days=1)
        while day <= end:
            sync_day(conn, day, args.new_only)
            day += timedelta(days=1)
    else:
        sync_day(conn, args.date or date.today() - timedelta(days=1), args.new_only)


if __name__ == "__main__":
    main()
