-- schedule_test.sql
-- Checks the NBA schedule views in 007_games.sql. Runs in a transaction and rolls back.
-- It never deletes: it adds its own test teams, and every check is limited to them or to its own
-- games (t1-t6), so the real season schedule and real rosters can't change the counts.

BEGIN;
CREATE TEMP TABLE results (test text, ok boolean, detail text);
CREATE TEMP TABLE today AS SELECT (now() AT TIME ZONE 'America/Chicago')::date AS d;
INSERT INTO teams (team_name, abv) VALUES ('Schedule Test A', 'ZZT'), ('Schedule Test B', 'ZZU');
CREATE TEMP TABLE t AS SELECT abv, team_id FROM teams;
CREATE FUNCTION pg_temp.team(a text) RETURNS uuid LANGUAGE sql AS $$ SELECT team_id FROM t WHERE abv = a $$;

-- ZZT: real NBA teams, using ESPN's spellings, checked against test games t1-t4 only.
-- ZZU: made-up NBA codes, so only test games t5-t6 can match them.
INSERT INTO players (player_id, name, nba_team) VALUES
    ('s1', 'Philly Guy', 'PHL'), ('s2', 'Suns Guy', 'PHO'), ('s3', 'Celtics Bench', 'BOS'), ('s4', 'Free Agent', 'LAL'),
    ('s5', 'Test Active A', 'ZZA'), ('s6', 'Test Active B', 'ZZB'), ('s7', 'Test Bench C', 'ZZC');
INSERT INTO rosters (team_id, player_id, slot, acquired_date, acquired_via) VALUES
    (pg_temp.team('ZZT'), 's1', 'active', current_date, 'draft'),
    (pg_temp.team('ZZT'), 's2', 'active', current_date, 'draft'),
    (pg_temp.team('ZZT'), 's3', 'bench',  current_date, 'draft'),
    (pg_temp.team('ZZU'), 's5', 'active', current_date, 'draft'),
    (pg_temp.team('ZZU'), 's6', 'active', current_date, 'draft'),
    (pg_temp.team('ZZU'), 's7', 'bench',  current_date, 'draft');
INSERT INTO games (game_id, season, game_date, tip_utc, home_team, away_team, season_type) VALUES
    ('t1', '2026-27', (SELECT d FROM today),     (SELECT d FROM today) + time '00:30' + interval '1 day', 'PHI', 'BOS', 'Regular Season'),
    ('t2', '2026-27', (SELECT d FROM today),     (SELECT d FROM today) + time '02:00' + interval '1 day', 'LAL', 'PHX', 'Regular Season'),
    ('t3', '2026-27', (SELECT d FROM today) - 1, null, 'PHI', 'NYK', 'Regular Season'),
    ('t4', '2026-27', (SELECT d FROM today) + 1, null, 'MIA', 'PHI', 'Regular Season'),
    ('t5', '2026-27', (SELECT d FROM today),     null, 'ZZA', 'ZZC', 'Regular Season'),
    ('t6', '2026-27', (SELECT d FROM today),     null, 'ZZX', 'ZZB', 'Regular Season');
UPDATE games SET postponed = true WHERE game_id = 't4';

CREATE TEMP TABLE zzt AS SELECT * FROM report_team_schedule WHERE abv = 'ZZT' AND game_id IN ('t1', 't2', 't3', 't4');

INSERT INTO results SELECT 'ESPN PHL/PHO map to NBA PHI/PHX', nba_tricode('PHL') = 'PHI' AND nba_tricode('pho') = 'PHX'
    AND nba_tricode('BOS') = 'BOS', nba_tricode('PHL') || ',' || nba_tricode('PHO');
INSERT INTO results SELECT 'tip time shown in Central', tip_central = (SELECT d FROM today) + time '19:30', tip_central::text
    FROM report_schedule WHERE game_id = 't1';
INSERT INTO results SELECT 'rostered players matched to games', count(*) = 3, string_agg(player_name || ' ' || opponent, '; ' ORDER BY player_name)
    FROM zzt;
INSERT INTO results SELECT 'home/away opponent text', bool_and(CASE player_name WHEN 'Philly Guy' THEN opponent = 'vs BOS'
    WHEN 'Suns Guy' THEN opponent = '@ LAL' ELSE opponent = '@ PHI' END), string_agg(opponent, ',')
    FROM zzt;
INSERT INTO results SELECT 'past and postponed games left out', count(*) = 0, count(*)::text
    FROM zzt WHERE game_id IN ('t3', 't4');
INSERT INTO results SELECT 'unrostered players left out', count(*) = 0, count(*)::text
    FROM report_team_schedule WHERE player_name = 'Free Agent';
INSERT INTO results SELECT 'games per day counts active only', active_games = 2 AND all_games = 3, active_games || '/' || all_games
    FROM report_team_games_by_day WHERE abv = 'ZZU' AND game_date = (SELECT d FROM today);
INSERT INTO results SELECT 'freshness lists schedule', count(*) = 1, '' FROM report_freshness WHERE dataset = 'schedule';

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, test, detail FROM results ORDER BY ok, test;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM results;
ROLLBACK;
