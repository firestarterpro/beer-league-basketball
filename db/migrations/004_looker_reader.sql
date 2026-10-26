-- 004_looker_reader.sql
-- Read-only role for Looker Studio. It can SELECT, never change league data.
-- Run with the password passed in, never written into this file:
--   psql "$DATABASE_URL" -v looker_password="'choose-a-password'" -f db/migrations/004_looker_reader.sql

\if :{?looker_password}
\else
  \echo 'Pass -v looker_password=... to create the Looker role'
  \quit
\endif

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'looker_reader') THEN
        CREATE ROLE looker_reader LOGIN;
    END IF;
END $$;
ALTER ROLE looker_reader PASSWORD :looker_password;

GRANT USAGE ON SCHEMA public TO looker_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO looker_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO looker_reader;
GRANT EXECUTE ON FUNCTION vote_threshold() TO looker_reader;
