"""Offline check of nba_sync's schedule and live-score writes, using fake NBA JSON.

Proves the parsing and SQL work against a real Postgres. The first real run of
`nba_sync.py schedule` on the LM's PC proves NBA.com's live shape.

The writes are rolled back, but they still land on whatever database they reach, so they only run
against a scratch database named in TEST_DATABASE_URL, never DATABASE_URL: importing nba_sync loads
sync/.env, whose DATABASE_URL is the live league. Without TEST_DATABASE_URL only the database-free
checks run.

    TEST_DATABASE_URL=postgresql://localhost/scratch python test_nba_schedule_offline.py
"""

import os
import tempfile
from datetime import date
from pathlib import Path

import psycopg

import nba_sync as n

SCHEDULE = {"headers": ["gameId", "gameDate", "gameDateEst", "gameDateTimeUTC", "gameStatus", "gameStatusText",
                        "postponedStatus", "homeTeam_teamTricode", "awayTeam_teamTricode",
                        "homeTeam_score", "awayTeam_score"],
            "data": [
                ["0022600001", "10/20/2026 00:00:00", "2026-10-20T00:00:00Z", "2026-10-20T23:30:00Z", 3, "Final",
                 "A", "BOS", "NYK", 110, 104],
                ["0022600002", "10/20/2026 00:00:00", "2026-10-20T00:00:00Z", "2026-10-21T02:00:00Z", 1, "9:00 pm ET",
                 "A", "LAL", "GSW", 0, 0],
                ["0012600050", "10/02/2026 00:00:00", "2026-10-02T00:00:00Z", "2026-10-02T23:00:00Z", 3, "Final",
                 "A", "MIA", "ORL", 99, 98],
                ["0042600101", "04/18/2027 00:00:00", "2027-04-18T00:00:00Z", None, 1, "TBD",
                 "A", "", "", 0, 0],         # playoff slot with no teams yet
            ]}
HEADER = {"headers": ["gameId", "gameStatus", "gameStatusText"],
          "data": [["0022600002", 2, "Q3 4:12"], ["0022699999", 1, "10:00 pm ET"]]}
LINE = {"headers": ["gameId", "teamTricode", "score"],
        "data": [["0022600002", "GSW", 77], ["0022600002", "LAL", 81]]}

results = []


def scratch_db():
    """TEST_DATABASE_URL, or None (skip the database checks). Never the live DATABASE_URL from sync/.env."""
    url = os.environ.get("TEST_DATABASE_URL")
    return url if url and url != os.environ.get("DATABASE_URL") else None


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))


def main():
    check("season from date", n.current_season(date(2026, 10, 23)) == "2026-27"
          and n.current_season(date(2027, 3, 1)) == "2026-27", n.current_season(date(2026, 10, 23)))
    games = n.parse_schedule(SCHEDULE, "2026-27")
    check("bracket slots without teams skipped", len(games) == 3, str(len(games)))
    by_id = {g["game_id"]: g for g in games}
    check("season type from game id", by_id["0012600050"]["season_type"] == "Preseason"
          and by_id["0022600001"]["season_type"] == "Regular Season")
    check("scores only once started", by_id["0022600002"]["home_score"] is None and by_id["0022600001"]["home_score"] == 110)

    url = scratch_db()
    if not url:
        print("no scratch TEST_DATABASE_URL: database checks skipped")
    else:
        with psycopg.connect(url) as conn, conn.cursor() as cur:
            cur.executemany(n.UPSERT_GAME, games)
            cur.executemany(n.UPSERT_GAME, games)          # re-run is harmless
            cur.execute("SELECT count(*) FROM games WHERE season = '2026-27'")
            check("schedule upsert", cur.fetchone()[0] == 3)
            cur.execute("SELECT tip_central FROM report_schedule WHERE game_id = '0022600002'")
            check("late tip shows Central time", str(cur.fetchone()[0]) == "2026-10-20 21:00:00")

            cur.execute("SELECT game_id, home_team, away_team FROM games WHERE game_date = '2026-10-20'")
            teams = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
            updates = n.parse_scoreboard(HEADER, LINE, teams)
            check("unknown games ignored", [u["game_id"] for u in updates] == ["0022600002"])
            check("scores matched by team, not order", updates[0]["home_score"] == 81 and updates[0]["away_score"] == 77,
                  f"{updates[0]['home_score']}-{updates[0]['away_score']}")
            conn.rollback()

    n.SCHEDULE_CACHE = Path(tempfile.mkdtemp()) / "schedule.json"   # not the real raw_cache copy
    n.save_schedule_cache(games)
    check("local schedule copy written", n.SCHEDULE_CACHE.exists())
    print(f"{sum(results)} passed, {len(results) - sum(results)} failed")


if __name__ == "__main__":
    main()
