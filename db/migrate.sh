#!/usr/bin/env bash
# Applies every migration, then the seeds, to the database in $DATABASE_URL.
# Usage: DATABASE_URL="postgresql://..." ./db/migrate.sh
# Migrations are plain SQL run in order. Run each one once on a fresh database.
set -euo pipefail
cd "$(dirname "$0")"
: "${DATABASE_URL:?Set DATABASE_URL to your Neon connection string}"
for f in $(ls migrations/*.sql | grep -v looker_reader); do
  echo "== $f"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
for f in seed/*.sql; do
  echo "== $f"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "Done. To add the Looker role: psql \"\$DATABASE_URL\" -v looker_password=\"'...'\" -f migrations/004_looker_reader.sql"
