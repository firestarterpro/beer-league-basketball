"""Set up (or check) the league database. Python version of migrate.sh, for Windows.

    python db/migrate.py                    # apply any migrations and seeds not yet run
    python db/migrate.py --test             # run the rule and workflow tests
    python db/migrate.py --looker-password "pick-one"   # create the read-only Looker login

Reads DATABASE_URL from sync/.env.
"""

import argparse
import os
import sys
from pathlib import Path

import psycopg
from psycopg import sql
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
load_dotenv(HERE.parent / "sync" / ".env")


# Databases set up before migrations were tracked already have these.
FIRST_RELEASE = ["migrations/001_core.sql", "migrations/002_voting_and_queue.sql", "migrations/003_views.sql",
                 "migrations/005_functions.sql", "migrations/006_reports.sql", "seed/001_league.sql"]


def run_file(conn, path):
    name = path.relative_to(HERE).as_posix()
    print(f"== {name}")
    conn.execute(path.read_text(encoding="utf-8"))
    conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (name,))


def applied_files(conn):
    """Names of files already run. Creates the tracking table on first use."""
    exists = conn.execute("SELECT to_regclass('schema_migrations')").fetchone()[0]
    if not exists:
        conn.execute("""CREATE TABLE schema_migrations (
                            name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())""")
        if conn.execute("SELECT to_regclass('teams')").fetchone()[0]:
            for name in FIRST_RELEASE:
                conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (name,))
    return {r[0] for r in conn.execute("SELECT name FROM schema_migrations")}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--test", action="store_true")
    p.add_argument("--looker-password")
    args = p.parse_args()
    url = os.environ.get("DATABASE_URL") or sys.exit("Missing DATABASE_URL in sync/.env")

    with psycopg.connect(url, autocommit=True) as conn:
        if args.looker_password:
            conn.execute("""DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'looker_reader') THEN
                    CREATE ROLE looker_reader LOGIN; END IF; END $$""")
            conn.execute(sql.SQL("ALTER ROLE looker_reader PASSWORD {}").format(sql.Literal(args.looker_password)))
            for stmt in ("GRANT USAGE ON SCHEMA public TO looker_reader",
                         "GRANT SELECT ON ALL TABLES IN SCHEMA public TO looker_reader",
                         "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO looker_reader",
                         "GRANT EXECUTE ON FUNCTION vote_threshold() TO looker_reader"):
                conn.execute(stmt)
            print("looker_reader is ready (read-only)")
            return
        if args.test:
            for name in ("rules_test.sql", "workflow_test.sql", "schedule_test.sql"):
                with conn.cursor() as cur:
                    cur.execute((HERE / "tests" / name).read_text(encoding="utf-8"))
                    # the last SELECT before ROLLBACK is the pass/fail count
                    while cur.nextset():
                        if cur.description and [c.name for c in cur.description] == ["passed", "failed"]:
                            passed, failed = cur.fetchone()
                            print(f"{name}: {passed} passed, {failed} failed")
            return
        done = applied_files(conn)
        todo = [p for p in sorted((HERE / "migrations").glob("*.sql")) if "looker_reader" not in p.name]
        todo += sorted((HERE / "seed").glob("*.sql"))
        todo = [p for p in todo if p.relative_to(HERE).as_posix() not in done]
        for path in todo:
            run_file(conn, path)
    print("Database ready." if todo else "Database already up to date.")


if __name__ == "__main__":
    main()
