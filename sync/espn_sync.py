"""ESPN -> Neon sync for Beer League Basketball.

Runs on the LM's PC (ESPN blocks most cloud servers). Reads settings from a
.env file next to this script (see .env.example). Every command is safe to
re-run: rows are upserted or de-duplicated.

    python espn_sync.py teams          # link ESPN teams to the teams table
    python espn_sync.py players        # NBA player pool, injuries, ESPN ranks
    python espn_sync.py injuries       # body part + estimated return date from ESPN's NBA injury report
    python espn_sync.py rosters        # current rosters (replaces rosters table)
    python espn_sync.py transactions   # recent adds/drops/waivers/trades (append-only)
    python espn_sync.py standings      # cumulative points + rank
    python espn_sync.py scores         # yesterday's box scores + lineups
    python espn_sync.py scores --period 12
    python espn_sync.py scores --current  # today's live scores (during games)
    python espn_sync.py tiers --version 1 --effective 2026-10-25
    python espn_sync.py nightly        # players, rosters, transactions, standings, scores
    python espn_sync.py dump rosters   # save raw ESPN JSON to raw_cache/ for debugging
"""

import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import psycopg
import requests
from dotenv import load_dotenv
from espn_api.basketball import League
from espn_api.basketball.constant import POSITION_MAP, PRO_TEAM_MAP

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")

# ESPN stat ids -> scoring_ledger.stat_line keys (see db/migrations/001_core.sql)
STAT_KEYS = {
    "0": "pts", "1": "blk", "2": "stl", "3": "ast", "4": "oreb", "5": "dreb",
    "6": "reb", "7": "ej", "8": "ff", "9": "pf", "10": "tf", "11": "tov",
    "13": "fgm", "14": "fga", "15": "ftm", "16": "fta", "17": "tpm", "18": "tpa",
    "40": "min", "43": "team_win",
}
# Season-window stats (player_stats.totals) also keep the bonus and games counts.
SEASON_KEYS = {**STAT_KEYS, "37": "dd", "38": "td", "39": "qd", "41": "gs", "42": "gp"}
# ESPN stat window id prefix -> player_stats.split ("002027" = 2026-27 season totals)
SPLITS = {"00": "season", "01": "last7", "02": "last15", "03": "last30", "10": "projected"}
ACQUIRED_VIA = {"DRAFT": "draft", "ADD": "free_agent", "WAIVER": "waiver", "TRADE": "trade"}
# ESPN activity message ids -> transactions.type
MESSAGE_TYPES = {178: "add", 180: "waiver", 179: "drop", 181: "drop", 239: "drop", 244: "trade"}
SINGLE_GAME_SPLIT = 5   # ESPN statSplitTypeId for one scoring period
# ESPN's public NBA injury report: every listed injury with body part, side and estimated return date.
# Its athlete ids are the same as the fantasy player ids.
INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
INJURY_COLUMNS = ("injury_body_part", "injury_side", "injury_detail", "injury_return_date")   # migration 018


def env(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Missing {name} in sync/.env (see .env.example)")
    return value


def connect_espn():
    return League(
        league_id=int(env("ESPN_LEAGUE_ID")),
        year=int(env("ESPN_YEAR")),          # ESPN names a season by its end year: 2026-27 = 2027
        espn_s2=env("ESPN_S2"),
        swid=env("ESPN_SWID"),
    )


def connect_db():
    return psycopg.connect(env("DATABASE_URL"))


def raw(league, views, scoring_period=None, headers=None):
    params = {"view": views}
    if scoring_period is not None:
        params["scoringPeriodId"] = scoring_period
    return league.espn_request.league_get(params=params, headers=headers)


def slot_name(slot_id):
    return POSITION_MAP.get(slot_id, str(slot_id))


def roster_slot(slot_id):
    name = slot_name(slot_id)
    return "IR" if name == "IR" else "bench" if name == "BE" else "active"


def ms_to_date(ms):
    return datetime.fromtimestamp(ms / 1000).date() if ms else None


def team_map(cur):
    """espn_team_id -> our team_id."""
    cur.execute("SELECT espn_team_id, team_id FROM teams WHERE espn_team_id IS NOT NULL")
    return dict(cur.fetchall())


def upsert_player(cur, p, rank=None):
    """p is an ESPN player object from raw JSON."""
    positions = sorted({slot_name(s) for s in p.get("eligibleSlots", [])
                        if slot_name(s) in ("PG", "SG", "SF", "PF", "C")})
    # Auction value comes with the player pool, not with rosters, so keep the old one when it's missing.
    auction = (((p.get("draftRanksByRankType") or {}).get("STANDARD") or {}).get("auctionValue")
               or (p.get("ownership") or {}).get("auctionValueAverage"))
    cur.execute(
        """INSERT INTO players (player_id, name, nba_team, positions, status, injury_note, auction_value)
           VALUES (%s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (player_id) DO UPDATE SET
               name = EXCLUDED.name, nba_team = EXCLUDED.nba_team, positions = EXCLUDED.positions,
               status = EXCLUDED.status, injury_note = coalesce(EXCLUDED.injury_note, players.injury_note),
               auction_value = coalesce(EXCLUDED.auction_value, players.auction_value)""",
        (str(p["id"]), p["fullName"], PRO_TEAM_MAP.get(p.get("proTeamId"), None), positions,
         p.get("injuryStatus", "ACTIVE"), (p.get("injuryDetails") or {}).get("type"), auction or None),
    )


def parse_injuries(data):
    """ESPN injury report JSON -> {player_id: {body_part, side, detail, return_date, note}}.
    The athlete has no id field of its own; it's in his ESPN links (.../id/4712863/...)."""
    out = {}
    for team in data.get("injuries", []):
        for inj in team.get("injuries", []):
            ath = inj.get("athlete") or {}
            pid = next((m.group(1) for link in ath.get("links", [])
                        if (m := re.search(r"/id/(\d+)", link.get("href", "")))), None)
            d = inj.get("details") or {}
            if not pid or pid in out:
                continue                # one entry per player; keep the first if ESPN ever repeats him
            part, side, detail = d.get("type"), d.get("side"), d.get("detail")
            # 'Left foot fracture'; 'Illness' / 'Rest' alone. ESPN says 'Not Specified' for no side.
            side = side if side and side != "Not Specified" else None
            note = " ".join(w for w in (side, (part or "").lower() if side else part, (detail or "").lower()) if w)
            out[pid] = {"body_part": part, "side": side, "detail": detail,
                        "return_date": (d.get("returnDate") or "")[:10] or None, "note": note or None}
    return out


def upsert_stats(cur, p, year):
    """Season, last 7/15/30 and projected totals for one player (every player, not just rostered)."""
    for split in p.get("stats", []):
        name = SPLITS.get(str(split.get("id", ""))[:2])
        if not name or split.get("seasonId") != year or split.get("scoringPeriodId", 0) != 0:
            continue
        totals = {SEASON_KEYS[k]: v for k, v in (split.get("stats") or {}).items() if k in SEASON_KEYS}
        cur.execute(
            """INSERT INTO player_stats (player_id, split, games, totals, espn_points, updated_at)
               VALUES (%s, %s, %s, %s, %s, now())
               ON CONFLICT (player_id, split) DO UPDATE SET games = EXCLUDED.games, totals = EXCLUDED.totals,
                   espn_points = EXCLUDED.espn_points, updated_at = now()""",
            (str(p["id"]), name, int(totals.get("gp") or 0), json.dumps(totals), split.get("appliedTotal")),
        )


# ---------------------------------------------------------------- commands

def cmd_teams(league, conn, args):
    """Match ESPN teams to our rows by abbreviation, else report them for the LM."""
    with conn.cursor() as cur:
        for t in league.teams:
            cur.execute(
                """UPDATE teams SET espn_team_id = %s
                   WHERE espn_team_id IS NULL AND upper(abv) = upper(%s) RETURNING team_name""",
                (t.team_id, t.team_abbrev),
            )
            hit = cur.fetchone()
            cur.execute("SELECT team_name FROM teams WHERE espn_team_id = %s", (t.team_id,))
            linked = cur.fetchone()
            status = f"linked to {linked[0]}" if linked else "NOT LINKED: set teams.espn_team_id by hand"
            print(f"ESPN team {t.team_id} {t.team_abbrev!r} {t.team_name!r}: {status}")
    conn.commit()


def cmd_players(league, conn, args):
    """Pull the player pool (rostered + free agents) with ESPN's projection ranks."""
    year = league.year
    filters = {"players": {"limit": args.limit,
                           "sortDraftRanks": {"sortPriority": 1, "sortAsc": True, "value": "STANDARD"},
                           "filterStatsForTopScoringPeriodIds": {
                               "value": 1, "additionalValue": [f"{k}{year}" for k in SPLITS]}}}
    data = league.espn_request.league_get(
        params={"view": "kona_player_info"}, headers={"x-fantasy-filter": json.dumps(filters)})
    with conn.cursor() as cur:
        for entry in data["players"]:
            upsert_player(cur, entry["player"])
            upsert_stats(cur, entry["player"], year)
    conn.commit()
    print(f"players: {len(data['players'])} upserted")
    return data["players"]


def cmd_injuries(league, conn, args, data=None):
    """Body part and estimated return date for every injured player (clears everyone else).
    Skips quietly until migration 018 adds the columns, and never stops the nightly run."""
    with conn.cursor() as cur:
        cur.execute("""SELECT count(*) FROM information_schema.columns
                       WHERE table_name = 'players' AND column_name = ANY(%s)""", (list(INJURY_COLUMNS),))
        if cur.fetchone()[0] < len(INJURY_COLUMNS):
            print("injuries: skipped, run db/migrate.py first (018_injury_details.sql)")
            return
        if data is None:
            try:
                res = requests.get(INJURIES_URL, timeout=30)
                res.raise_for_status()
                data = res.json()
            except Exception as e:      # a bad night at ESPN leaves yesterday's injuries in place
                print(f"injuries: ESPN injury report failed ({e}); nothing changed")
                return
        hurt = parse_injuries(data)
        cur.execute("""UPDATE players SET injury_body_part = NULL, injury_side = NULL, injury_detail = NULL,
                           injury_return_date = NULL, injury_note = NULL, injury_updated_at = now()
                       WHERE injury_note IS NOT NULL OR injury_body_part IS NOT NULL OR injury_return_date IS NOT NULL""")
        cur.executemany(
            """UPDATE players SET injury_body_part = %(body_part)s, injury_side = %(side)s, injury_detail = %(detail)s,
                   injury_return_date = %(return_date)s, injury_note = %(note)s, injury_updated_at = now()
               WHERE player_id = %(pid)s""",
            [{"pid": pid, **v} for pid, v in hurt.items()])
        cur.execute("SELECT count(*) FROM players WHERE injury_body_part IS NOT NULL")
        found = cur.fetchone()[0]
    conn.commit()
    print(f"injuries: {len(hurt)} on ESPN's report, {found} of them in our player pool")


def cmd_tiers(league, conn, args):
    """Freeze a versioned tier snapshot from ESPN's projection ranks."""
    entries = cmd_players(league, conn, args)
    ranked = []
    for e in entries:
        rank = ((e["player"].get("draftRanksByRankType") or {}).get("STANDARD") or {}).get("rank")
        if rank:
            ranked.append((rank, str(e["player"]["id"])))
    ranked.sort()
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO tier_snapshots (version, effective_date, notes)
               VALUES (%s, %s, %s) RETURNING snapshot_id""",
            (args.version, args.effective, f"ESPN STANDARD projection rank, pulled {date.today()}"),
        )
        snapshot_id = cur.fetchone()[0]
        # Re-number 1..N so gaps in ESPN's list don't shift tier boundaries
        cur.executemany(
            "INSERT INTO tier_assignments (snapshot_id, player_id, rank) VALUES (%s, %s, %s)",
            [(snapshot_id, pid, i) for i, (_, pid) in enumerate(ranked, start=1)],
        )
    conn.commit()
    print(f"tier snapshot v{args.version}: {len(ranked)} players ranked, effective {args.effective}")


def cmd_rosters(league, conn, args):
    data = raw(league, ["mRoster", "mTeam"])
    with conn.cursor() as cur:
        teams = team_map(cur)
        cur.execute("SELECT player_id, acquired_date FROM rosters")
        known_dates = dict(cur.fetchall())
        cur.execute("DELETE FROM rosters")
        count = 0
        for t in data["teams"]:
            team_id = teams.get(t["id"])
            if not team_id:
                print(f"skipping ESPN team {t['id']}: run `teams` first")
                continue
            for e in t.get("roster", {}).get("entries", []):
                p = e["playerPoolEntry"]["player"]
                upsert_player(cur, p)
                pid = str(p["id"])
                cur.execute(
                    """INSERT INTO rosters (team_id, player_id, slot, position_slot, acquired_date, acquired_via)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (team_id, pid, roster_slot(e["lineupSlotId"]), slot_name(e["lineupSlotId"]),
                     ms_to_date(e.get("acquisitionDate")) or known_dates.get(pid),
                     ACQUIRED_VIA.get(e.get("acquisitionType"), "free_agent")),
                )
                count += 1
    conn.commit()
    print(f"rosters: {count} players on {len(data['teams'])} teams")


def cmd_transactions(league, conn, args):
    """Append recent league activity (raw ESPN messages). The key makes re-runs skip logged rows."""
    filters = {"topics": {
        "filterType": {"value": ["ACTIVITY_TRANSACTIONS"]},
        "limit": getattr(args, "tx_limit", 100), "limitPerMessageSet": {"value": 25},
        "sortMessageDate": {"sortPriority": 1, "sortAsc": False},
        "filterIncludeMessageTypeIds": {"value": list(MESSAGE_TYPES)}}}
    data = league.espn_request.league_get(
        extend="/communication/", params={"view": "kona_league_communication"},
        headers={"x-fantasy-filter": json.dumps(filters)})
    added = 0
    with conn.cursor() as cur:
        teams = team_map(cur)
        for topic in data.get("topics", []):
            trade_legs = []
            for msg in topic.get("messages", []):
                kind = MESSAGE_TYPES.get(msg.get("messageTypeId"))
                if not kind:
                    continue
                espn_team = msg.get("for") if msg["messageTypeId"] == 239 else msg.get("to")
                pid = str(msg.get("targetId"))
                key = f"{topic.get('id')}:{msg.get('id', '')}:{kind}:{pid}"
                cur.execute(
                    """INSERT INTO transactions (espn_txn_id, type, team_id, player_id, "timestamp", details)
                       VALUES (%s, %s, %s, %s, to_timestamp(%s / 1000.0), %s)
                       ON CONFLICT (espn_txn_id) DO NOTHING""",
                    (key, kind, teams.get(espn_team), pid if player_exists(cur, pid) else None,
                     topic.get("date"), json.dumps({"espn_message_type": msg["messageTypeId"],
                                                    "from": msg.get("from"), "to": msg.get("to")})),
                )
                added += cur.rowcount
                if kind == "trade":
                    trade_legs.append((msg.get("to"), pid))
            if trade_legs:
                record_trade(cur, teams, topic.get("date"), trade_legs, topic.get("id"))
    conn.commit()
    print(f"transactions: {added} new")


def player_exists(cur, pid):
    cur.execute("SELECT 1 FROM players WHERE player_id = %s", (pid,))
    return cur.fetchone() is not None


def record_trade(cur, teams, when_ms, legs, topic_id):
    """legs = [(receiving ESPN team id, player id)]; a trade has exactly two teams."""
    receivers = sorted({t for t, _ in legs if t is not None})
    if len(receivers) != 2:
        return
    a, b = receivers
    cur.execute(
        """INSERT INTO trades (espn_trade_id, from_team, to_team, players_out, players_in, status, processed_at)
           VALUES (%s, %s, %s, %s, %s, 'processed', to_timestamp(%s / 1000.0))
           ON CONFLICT (espn_trade_id) DO NOTHING""",
        (str(topic_id), teams.get(a), teams.get(b),
         [p for t, p in legs if t == b], [p for t, p in legs if t == a], when_ms),
    )


def cmd_standings(league, conn, args):
    with conn.cursor() as cur:
        teams = team_map(cur)
        ordered = sorted(league.teams, key=lambda t: t.points_for, reverse=True)
        for rank, t in enumerate(ordered, start=1):
            if t.team_id in teams:
                cur.execute(
                    """INSERT INTO standings (team_id, total_points, rank, last_updated)
                       VALUES (%s, %s, %s, now())
                       ON CONFLICT (team_id) DO UPDATE SET
                           total_points = EXCLUDED.total_points, rank = EXCLUDED.rank, last_updated = now()""",
                    (teams[t.team_id], t.points_for, rank),
                )
    conn.commit()
    print(f"standings: {len(ordered)} teams")


def cmd_scores(league, conn, args):
    """One scoring period (= one NBA day): stat lines for rostered players + lineups."""
    period = args.period or (league.scoringPeriodId if getattr(args, "current", False)
                             else max(1, league.scoringPeriodId - 1))
    data = raw(league, ["mRoster"], scoring_period=period)
    schedule = league._get_pro_schedule(period)
    # Players with no game that day still get a lineup row, dated by the period's games.
    period_day = (min((ms_to_date(d) for _, d in schedule.values()), default=None)
                  or date.today() - timedelta(days=1))
    with conn.cursor() as cur:
        teams = team_map(cur)
        cur.execute("SELECT setting_value FROM league_settings WHERE setting_key = 'scoring_model'")
        model = (cur.fetchone() or ["unknown"])[0]
        lines = 0
        for t in data["teams"]:
            team_id = teams.get(t["id"])
            for e in t.get("roster", {}).get("entries", []):
                p = e["playerPoolEntry"]["player"]
                pid = str(p["id"])
                upsert_player(cur, p)
                game = schedule.get(p.get("proTeamId"))   # espn_api: proTeamId -> (opponent proTeamId, date ms)
                game_date = ms_to_date(game[1]) if game else period_day
                if team_id:
                    cur.execute(
                        """INSERT INTO lineups (team_id, game_date, position_slot, player_id, locked)
                           VALUES (%s, %s, %s, %s, true)
                           ON CONFLICT (team_id, game_date, player_id) DO UPDATE SET position_slot = EXCLUDED.position_slot""",
                        (team_id, game_date, slot_name(e["lineupSlotId"]), pid),
                    )
                split = next((s for s in p.get("stats", [])
                              if s.get("scoringPeriodId") == period
                              and s.get("statSplitTypeId") == SINGLE_GAME_SPLIT
                              and s.get("statSourceId", 0) == 0), None)
                if not split or not split.get("stats") or not game:
                    continue    # no game that day
                stat_line = {STAT_KEYS[k]: v for k, v in split["stats"].items() if k in STAT_KEYS}
                cur.execute(
                    """INSERT INTO scoring_ledger (player_id, game_id, game_date, stat_line, fantasy_points, scoring_model_version)
                       VALUES (%s, %s, %s, %s, %s, %s)
                       ON CONFLICT (player_id, game_id) DO UPDATE SET
                           stat_line = EXCLUDED.stat_line, fantasy_points = EXCLUDED.fantasy_points""",
                    (pid, f"{period}-{min(p['proTeamId'], game[0])}-{max(p['proTeamId'], game[0])}", game_date,
                     json.dumps(stat_line), split.get("appliedTotal"), model),
                )
                lines += 1
    conn.commit()
    print(f"scores: period {period}, {lines} stat lines")


def cmd_nightly(league, conn, args):
    for step in (cmd_players, cmd_rosters, cmd_transactions, cmd_standings, cmd_scores, cmd_injuries):
        step(league, conn, args)
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO compliance_checks (team_id, badge, violations)
               SELECT team_id, badge,
                      jsonb_build_object('t1', t1_count, 't2', t2_count, 'source', last_overage_source)
               FROM team_badges""")
    conn.commit()
    print("compliance_checks: logged")


def cmd_dump(league, conn, args):
    views = {"rosters": ["mRoster", "mTeam"], "settings": ["mSettings"], "league": ["mTeam", "mStatus"]}
    data = raw(league, views[args.what], scoring_period=args.period)
    out = HERE / "raw_cache" / f"{args.what}-{datetime.now():%Y%m%d-%H%M%S}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(data, indent=2))
    print(f"saved {out}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("teams", "rosters", "standings", "injuries"):
        sub.add_parser(name)
    for name in ("players", "nightly"):
        s = sub.add_parser(name)
        s.add_argument("--limit", type=int, default=600)
        s.add_argument("--period", type=int)
        s.add_argument("--current", action="store_true", help="score today's period instead of yesterday's")
    s = sub.add_parser("transactions"); s.add_argument("--limit", dest="tx_limit", type=int, default=100)
    s = sub.add_parser("scores"); s.add_argument("--period", type=int)
    s.add_argument("--current", action="store_true", help="today's period (live) instead of yesterday's")
    s = sub.add_parser("tiers")
    s.add_argument("--version", type=int, required=True)
    s.add_argument("--effective", required=True, help="YYYY-MM-DD the snapshot takes effect")
    s.add_argument("--limit", type=int, default=600)
    s = sub.add_parser("dump")
    s.add_argument("what", choices=["rosters", "settings", "league"])
    s.add_argument("--period", type=int)
    args = parser.parse_args()

    league = connect_espn()
    conn = None if args.command == "dump" else connect_db()
    globals()[f"cmd_{args.command}"](league, conn, args)


if __name__ == "__main__":
    main()
