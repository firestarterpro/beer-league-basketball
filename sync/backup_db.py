"""Save a dated copy of every league table to your PC.

    python backup_db.py                 # writes ..\\backups\\YYYY-MM-DD\\<table>.csv.gz
    python backup_db.py --out D:\\some\\folder

The table layouts live in db\\migrations, so a backup is just the rows. To
restore into a fresh database: run db\\migrate.py, then load each file with
COPY <table> FROM STDIN (CSV, HEADER). Old backups are never deleted.
"""

import argparse
import gzip
import os
import sys
from datetime import date
from pathlib import Path

import psycopg
from psycopg import sql
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=HERE.parent / "backups")
    args = parser.parse_args()
    url = os.environ.get("DATABASE_URL") or sys.exit("Missing DATABASE_URL in sync/.env")

    folder = args.out / date.today().isoformat()
    folder.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("""SELECT table_name FROM information_schema.tables
                       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name""")
        tables = [r[0] for r in cur.fetchall()]
        for table in tables:
            path = folder / f"{table}.csv.gz"
            with gzip.open(path, "wb") as f, cur.copy(
                    sql.SQL("COPY {} TO STDOUT (FORMAT csv, HEADER)").format(sql.Identifier(table))) as copy:
                for chunk in copy:
                    f.write(chunk)
    print(f"backed up {len(tables)} tables to {folder}")


if __name__ == "__main__":
    main()
