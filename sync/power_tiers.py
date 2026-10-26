"""Freeze a tier snapshot from the latest power-ranking run (Jason's model, 2026-10-23).

The tiers used to come from ESPN's projection rank (espn_sync.py tiers). Now
they come from the ranking named in league_settings.tier_ranking:
weekly_nba / minutes_nba / weekly_fantasy / minutes_fantasy, or avg_nba
(the average of the two NBA-model ranks, a player missing from one counts as 101).

Ranked players are matched to ESPN players by NBA.com id, else by name
(accents, punctuation and Jr./III ignored), and numbered 1..N. Everyone else in the
current snapshot follows in their current order, so they stay listed as Tier 3.

    python power_tiers.py --version 2                    # uses tier_ranking from league_settings
    python power_tiers.py --version 2 --ranking avg_nba --effective 2026-11-01
    python power_tiers.py --version 2 --dry-run          # show the top 50 and unmatched names, write nothing
"""

import argparse
import os
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

RANKINGS = ("weekly_nba", "minutes_nba", "weekly_fantasy", "minutes_fantasy")
MISSING = 101   # avg_nba: rank given to a player missing from one of the two lists


def norm(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    return " ".join(w for w in s.split() if w not in ("jr", "sr", "ii", "iii", "iv"))


def latest(cur, ranking):
    cur.execute(
        """SELECT rank, player_name, nba_person_id, run_date FROM power_rankings
           WHERE ranking = %s AND run_date = (SELECT max(run_date) FROM power_rankings WHERE ranking = %s)
           ORDER BY rank""", (ranking, ranking))
    return cur.fetchall()


def order(cur, ranking):
    """[(key, name, nba_person_id)] best first, plus the run date it came from."""
    if ranking in RANKINGS:
        rows = latest(cur, ranking)
        return [((r[2] or norm(r[1])), r[1], r[2]) for r in rows], (rows[0][3] if rows else None)
    if ranking == "avg_nba":
        lists = [latest(cur, k) for k in ("weekly_nba", "minutes_nba")]
        ranks, names = {}, {}
        for i, rows in enumerate(lists):
            for rank, name, pid, _ in rows:
                key = pid or norm(name)
                ranks.setdefault(key, [MISSING, MISSING])[i] = rank
                names[key] = (name, pid)
        best = sorted(ranks, key=lambda k: (sum(ranks[k]) / 2, min(ranks[k])))
        when = max((rows[0][3] for rows in lists if rows), default=None)
        return [(k, *names[k]) for k in best], when
    sys.exit(f"Unknown ranking {ranking!r}: use one of {', '.join(RANKINGS)} or avg_nba")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--version", type=int, required=True)
    p.add_argument("--ranking")
    p.add_argument("--effective", type=date.fromisoformat, default=date.today())
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    url = os.environ.get("DATABASE_URL") or sys.exit("Missing DATABASE_URL in sync/.env")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        ranking = args.ranking
        if not ranking:
            cur.execute("SELECT setting_value FROM league_settings WHERE setting_key = 'tier_ranking'")
            ranking = (cur.fetchone() or [None])[0]
            if not ranking or ranking == "tbd":
                sys.exit("league_settings.tier_ranking isn't set yet: pass --ranking")
        ranked, run_date = order(cur, ranking)
        if not ranked:
            sys.exit(f"No published {ranking} run yet: run publish_rankings.py first")

        cur.execute("SELECT player_id, name, nba_person_id FROM players")
        by_id, by_name = {}, {}
        for pid, name, nba in cur.fetchall():
            if nba:
                by_id[nba] = pid
            by_name.setdefault(norm(name), pid)
        placed, seen, missing = [], set(), []
        for key, name, nba in ranked:
            pid = by_id.get(nba) if nba else None
            pid = pid or by_name.get(norm(name))
            if not pid:
                missing.append(name)
            elif pid not in seen:
                placed.append(pid)
                seen.add(pid)
        # Everyone else keeps their current order behind the ranked players (all Tier 3).
        cur.execute("SELECT player_id FROM current_tiers ORDER BY rank")
        rest = [r[0] for r in cur.fetchall() if r[0] not in seen]

        print(f"{ranking} run {run_date}: {len(placed)} ranked players matched, {len(missing)} not found in ESPN's pool")
        for name in missing[:20]:
            print(f"  not matched: {name}")
        if args.dry_run:
            cur.execute("SELECT player_id, name FROM players WHERE player_id = ANY(%s)", (placed[:50],))
            names = dict(cur.fetchall())
            for i, pid in enumerate(placed[:50], start=1):
                print(f"{i:3} {'T1' if i <= 25 else 'T2'} {names.get(pid)}")
            return
        cur.execute(
            """INSERT INTO tier_snapshots (version, effective_date, notes, source, ranking_run_date)
               VALUES (%s, %s, %s, %s, %s) RETURNING snapshot_id""",
            (args.version, args.effective, f"{ranking} power ranking run {run_date}", ranking, run_date))
        snap = cur.fetchone()[0]
        cur.executemany("INSERT INTO tier_assignments (snapshot_id, player_id, rank) VALUES (%s, %s, %s)",
                        [(snap, pid, i) for i, pid in enumerate(placed + rest, start=1)])
        conn.commit()
    print(f"tier snapshot v{args.version}: {len(placed)} from {ranking} + {len(rest)} others, effective {args.effective}")


if __name__ == "__main__":
    main()
