"""Offline check of espn_sync's database writes, using fake ESPN JSON.

Proves the SQL and parsing work against a real Postgres. It can't prove ESPN's
live JSON still has this shape: the first real run on the LM's PC does that
(use `python espn_sync.py dump rosters` to compare).

The sync commands COMMIT, so the database checks only run against a scratch database named in
TEST_DATABASE_URL, never DATABASE_URL: importing espn_sync loads sync/.env, whose DATABASE_URL is
the live league. Without TEST_DATABASE_URL only the parsing checks run.

    TEST_DATABASE_URL=postgresql://localhost/scratch python test_espn_sync_offline.py
"""

import os
import types

import psycopg

import espn_sync as s

DAY_MS = 1_761_177_600_000  # 2025-10-23


def player(pid, name, pro=13, slots=(0, 1), stats=None):
    return {"id": pid, "fullName": name, "proTeamId": pro, "eligibleSlots": list(slots),
            "injuryStatus": "ACTIVE", "stats": stats or [],
            "draftRanksByRankType": {"STANDARD": {"rank": pid, "auctionValue": pid - 59}}}


ROSTER_JSON = {"teams": [
    {"id": 1, "roster": {"entries": [
        {"lineupSlotId": 0, "acquisitionType": "DRAFT", "acquisitionDate": DAY_MS,
         "playerPoolEntry": {"player": player(101, "Guard One", stats=[
             {"scoringPeriodId": 7, "statSplitTypeId": 5, "statSourceId": 0, "appliedTotal": 55.0,
              "stats": {"0": 20, "13": 8, "14": 15, "3": 10, "6": 10, "4": 2, "5": 8, "43": 1}}])}},
        {"lineupSlotId": 13, "acquisitionType": "TRADE", "acquisitionDate": DAY_MS,
         "playerPoolEntry": {"player": player(102, "Hurt Wing")}},
    ]}},
    {"id": 2, "roster": {"entries": [
        {"lineupSlotId": 12, "acquisitionType": "ADD", "acquisitionDate": DAY_MS,
         "playerPoolEntry": {"player": player(103, "Bench Big", slots=(4,), stats=[
             {"id": "002026", "seasonId": 2026, "scoringPeriodId": 0, "statSplitTypeId": 0, "appliedTotal": 383.0,
              "stats": {"0": 100, "13": 40, "14": 80, "3": 20, "4": 10, "5": 30, "43": 3,
                        "37": 3, "38": 1, "42": 5}},
             {"id": "002025", "seasonId": 2025, "scoringPeriodId": 0, "stats": {"0": 999}}])}},
    ]}},
]}
ACTIVITY_JSON = {"topics": [
    {"id": "topic-1", "date": DAY_MS, "messages": [
        {"id": "m1", "messageTypeId": 178, "to": 2, "targetId": 103},
        {"id": "m2", "messageTypeId": 239, "for": 2, "targetId": 101}]},
    {"id": "topic-2", "date": DAY_MS, "messages": [
        {"id": "m3", "messageTypeId": 244, "from": 2, "to": 1, "targetId": 102},
        {"id": "m4", "messageTypeId": 244, "from": 1, "to": 2, "targetId": 101}]},
]}


# ESPN's public NBA injury report, trimmed to the fields espn_sync reads.
def injury(pid, part, side=None, detail=None, back=None):
    return {"status": "Out", "athlete": {"displayName": f"Player {pid}", "links": [
                {"href": f"https://www.espn.com/nba/player/_/id/{pid}/someone"}]},
            "details": {"type": part, "side": side, "detail": detail, "returnDate": back}}


INJURY_JSON = {"injuries": [
    {"injuries": [injury(102, "Foot", "Left", "Fracture", "2026-11-20"), injury(999, "Knee", "Right")]},
    {"injuries": [injury(103, "Illness", "Not Specified", back="2026-11-08")]},
]}


def check_parse():
    """parse_injuries alone, no database needed."""
    got = s.parse_injuries(INJURY_JSON)
    checks = {
        "injury parse: body part": (got["102"]["body_part"], "Foot"),
        "injury parse: return date": (got["102"]["return_date"], "2026-11-20"),
        "injury parse: note": (got["102"]["note"], "Left foot fracture"),
        "injury parse: 'Not Specified' side dropped": (got["103"]["note"], "Illness"),
        "injury parse: no return date": (got["999"]["return_date"], None),
    }
    failed = 0
    for name, (got_, want) in checks.items():
        failed += got_ != want
        print(f"{'PASS' if got_ == want else 'FAIL'}  {name}: {got_!r}" + ("" if got_ == want else f" (want {want!r})"))
    return len(checks), failed


class FakeRequest:
    def league_get(self, params=None, headers=None, extend=""):
        if extend == "/communication/":
            return ACTIVITY_JSON
        if params.get("view") == "kona_player_info":
            return {"players": [{"player": e["playerPoolEntry"]["player"]}
                                for t in ROSTER_JSON["teams"] for e in t["roster"]["entries"]]}
        return ROSTER_JSON


class FakeLeague:
    espn_request = FakeRequest()
    scoringPeriodId = 8
    year = 2026
    teams = [types.SimpleNamespace(team_id=1, team_abbrev="LBA", team_name="Lebroniacs", points_for=900.5),
             types.SimpleNamespace(team_id=2, team_abbrev="STAT", team_name="Stats", points_for=1200.0)]

    def _get_pro_schedule(self, period):
        return {13: {str(period): [{"id": 401, "date": DAY_MS}]}}


def main():
    total, failed = check_parse()
    url = os.environ.get("TEST_DATABASE_URL")
    if not url or url == os.environ.get("DATABASE_URL"):
        print(f"{total - failed} passed, {failed} failed (no scratch TEST_DATABASE_URL: database checks skipped)")
        return
    league = FakeLeague()
    args = types.SimpleNamespace(limit=600, tx_limit=100, period=None, version=99, effective="2025-10-01")
    with psycopg.connect(url) as conn:
        for cmd in (s.cmd_teams, s.cmd_players, s.cmd_rosters, s.cmd_transactions,
                    s.cmd_transactions, s.cmd_standings, s.cmd_scores, s.cmd_tiers):
            cmd(league, conn, args)
        s.cmd_injuries(league, conn, args, data=INJURY_JSON)
        cur = conn.cursor()
        checks = {
            "teams linked": ("SELECT count(*) FROM teams WHERE espn_team_id IS NOT NULL", 2),
            "rosters": ("SELECT count(*) FROM rosters", 3),
            "IR slot": ("SELECT slot FROM rosters WHERE player_id = '102'", "IR"),
            "trade acquisition": ("SELECT acquired_via FROM rosters WHERE player_id = '102'", "trade"),
            "transactions deduped": ("SELECT count(*) FROM transactions", 4),
            "trade recorded": ("SELECT count(*) FROM trades", 1),
            "standings rank": ("SELECT rank FROM standings JOIN teams USING (team_id) WHERE abv = 'STAT'", 1),
            "stat line": ("SELECT (stat_line->>'pts')::int FROM scoring_ledger WHERE player_id = '101'", 20),
            "hustle points": ("SELECT fantasy_points FROM fantasy_points_by_model "
                              "WHERE player_id = '101' AND model_key = 'hustle'", None),
            "lineup slot": ("SELECT position_slot FROM lineups WHERE player_id = '102'", "IR"),
            "auction value": ("SELECT auction_value::int FROM players WHERE player_id = '101'", 42),
            "season stats (last season skipped)": ("SELECT count(*) FROM player_stats WHERE player_id = '103'", 1),
            "season games": ("SELECT games FROM player_stats WHERE player_id = '103' AND split = 'season'", 5),
            # 2*100 + 4*40 - 2*80 + 4*20 + 10 + 2*30 + 5*3 team wins, + 2 DD x 5 + 1 TD x 8 (no stacking)
            "season hustle points": ("SELECT fantasy_points::int FROM player_stat_points "
                                     "WHERE player_id = '103' AND model_key = 'hustle'", 383),
            "tier snapshot": ("SELECT count(*) FROM tier_assignments ta JOIN tier_snapshots ts "
                              "USING (snapshot_id) WHERE ts.version = 99", 3),
        }
        cur.execute("SELECT count(*) FROM information_schema.columns WHERE table_name = 'players' "
                    "AND column_name = 'injury_return_date'")
        if cur.fetchone()[0]:       # 018_injury_details.sql has run
            checks |= {
                "injury body part": ("SELECT injury_body_part FROM players WHERE player_id = '102'", "Foot"),
                "injury return date": ("SELECT injury_return_date::text FROM players WHERE player_id = '102'", "2026-11-20"),
                "injury note": ("SELECT injury_note FROM players WHERE player_id = '102'", "Left foot fracture"),
                "healthy player cleared": ("SELECT count(*) FROM players WHERE player_id = '101' "
                                           "AND injury_note IS NULL AND injury_return_date IS NULL", 1),
                "unknown player ignored": ("SELECT count(*) FROM players WHERE player_id = '999'", 0),
            }
        total += len(checks)
        for name, (sql, want) in checks.items():
            cur.execute(sql)
            got = cur.fetchone()[0]
            ok = want is None or got == want
            failed += not ok
            print(f"{'PASS' if ok else 'FAIL'}  {name}: {got}" + ("" if ok else f" (want {want})"))
        conn.rollback()
        print(f"{total - failed} passed, {failed} failed")


if __name__ == "__main__":
    main()
