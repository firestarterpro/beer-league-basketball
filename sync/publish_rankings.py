"""Load power-ranking results from build_model.py into Neon for Looker.

build_model.py (in your beer-league-sample folder) writes one CSV per ranking.
This script reads those CSVs and stores them as one dated run in the
power_rankings table. Re-running for the same date replaces that day's run.

    python publish_rankings.py "C:\\Templar Archives\\Basketball Bro\\beer-league-sample"
    python publish_rankings.py <folder> --date 2026-11-02 --dry-run

Which file feeds which ranking is set in FILES below. Column names are
matched loosely (rank / player / team / score); every other column is kept
in the extras field so nothing is lost.
"""

import argparse
import csv
import json
import os
import sys
from datetime import date
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

# ranking key -> CSV file names to try, first match wins (Minutes uses the 30-minute rule files)
FILES = {
    "weekly_nba": ["ranking_weekly_nba.csv"],
    "weekly_fantasy": ["ranking_weekly_fantasy.csv"],
    "minutes_nba": ["ranking_minutes_nba_min30.csv", "ranking_minutes_nba.csv"],
    "minutes_fantasy": ["ranking_minutes_fantasy_min30.csv", "ranking_minutes_fantasy.csv"],
}
RANK_COLS = ("rank", "RANK", "Rank", "#")
NAME_COLS = ("player", "PLAYER_NAME", "player_name", "name", "Player")
TEAM_COLS = ("team", "TEAM_ABBREVIATION", "nba_team", "Team")
ID_COLS = ("PLAYER_ID", "player_id", "personId", "nba_person_id")
SCORE_COLS = ("score", "power", "power_score", "per48", "per_48", "Score")


def pick(row, names):
    for n in names:
        if n in row and str(row[n]).strip() != "":
            return n
    return None


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def read_ranking(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return []
    first = rows[0]
    name_col = pick(first, NAME_COLS) or sys.exit(f"{path.name}: no player-name column ({', '.join(first)})")
    rank_col, team_col, id_col = pick(first, RANK_COLS), pick(first, TEAM_COLS), pick(first, ID_COLS)
    score_col = pick(first, SCORE_COLS)
    if not score_col:   # fall back to the last numeric column
        numeric = [k for k, v in first.items() if number(v) is not None and k not in (rank_col, id_col)]
        score_col = numeric[-1] if numeric else None
    out = []
    for i, row in enumerate(rows, start=1):
        used = {rank_col, name_col, team_col, id_col, score_col}
        out.append({
            "rank": int(number(row[rank_col]) or i) if rank_col else i,
            "player_name": row[name_col].strip(),
            "nba_team": row.get(team_col) if team_col else None,
            "nba_person_id": int(number(row[id_col])) if id_col and number(row[id_col]) else None,
            "score": number(row[score_col]) if score_col else None,
            "extras": {k: v for k, v in row.items() if k not in used},
        })
    print(f"{path.name}: {len(out)} rows (name={name_col}, score={score_col}, rank={rank_col or 'row order'})")
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path)
    parser.add_argument("--date", type=date.fromisoformat, default=date.today())
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    runs = {}
    for ranking, names in FILES.items():
        path = next((args.folder / n for n in names if (args.folder / n).exists()), None)
        if path:
            runs[ranking] = read_ranking(path)
        else:
            print(f"{ranking}: no file found (looked for {', '.join(names)})")
    if args.dry_run or not runs:
        return

    url = os.environ.get("DATABASE_URL") or sys.exit("Missing DATABASE_URL in sync/.env")
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        for ranking, rows in runs.items():
            cur.execute("DELETE FROM power_rankings WHERE run_date = %s AND ranking = %s", (args.date, ranking))
            cur.executemany(
                """INSERT INTO power_rankings (run_date, ranking, rank, player_name, nba_team, nba_person_id, score, extras)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                [(args.date, ranking, r["rank"], r["player_name"], r["nba_team"], r["nba_person_id"],
                  r["score"], json.dumps(r["extras"])) for r in rows],
            )
        conn.commit()
    print(f"published {sum(len(r) for r in runs.values())} rows for {args.date}")


if __name__ == "__main__":
    main()
