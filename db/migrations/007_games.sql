-- NBA schedule: every game of the season with tip time, status and score.
-- Filled by `nba_sync.py schedule` (whole season) and `nba_sync.py today`
-- (live status and scores for today's games).
BEGIN;

CREATE TABLE games (
    game_id      text PRIMARY KEY,                -- e.g. '0022600001'
    season       text NOT NULL,                   -- '2026-27'
    game_date    date NOT NULL,                   -- NBA's (Eastern) game date
    tip_utc      timestamptz,                     -- null until NBA sets a time
    home_team    text NOT NULL,                   -- NBA tricode, e.g. 'BOS'
    away_team    text NOT NULL,
    season_type  text NOT NULL,                   -- Preseason / Regular Season / NBA Cup / Play-In / Playoffs
    status       smallint NOT NULL DEFAULT 1,     -- 1 scheduled, 2 in progress, 3 final
    status_text  text,                            -- NBA's own text: '7:30 pm ET', 'Q3 4:12', 'Final/OT'
    home_score   integer,
    away_score   integer,
    postponed    boolean NOT NULL DEFAULT false,
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX games_date_idx ON games (game_date);

CREATE TRIGGER games_touch BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ESPN and NBA.com spell two teams differently.
CREATE FUNCTION nba_tricode(espn_abbrev text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE upper(espn_abbrev) WHEN 'PHL' THEN 'PHI' WHEN 'PHO' THEN 'PHX' ELSE upper(espn_abbrev) END
$$;

-- Every game, with the tip time in league (Central) time.
CREATE VIEW report_schedule AS
SELECT g.game_id, g.game_date, g.season_type,
       (g.tip_utc AT TIME ZONE 'America/Chicago') AS tip_central,
       g.away_team, g.home_team, g.away_team || ' @ ' || g.home_team AS matchup,
       CASE g.status WHEN 1 THEN 'Scheduled' WHEN 2 THEN 'In Progress' ELSE 'Final' END AS status,
       g.status_text, g.away_score, g.home_score, g.postponed
FROM games g;

-- Each fantasy team's rostered players and their NBA games from today on.
CREATE VIEW report_team_schedule AS
SELECT t.team_id, t.team_name, t.abv, p.player_id, p.nba_person_id, p.name AS player_name, p.nba_team, r.slot, r.position_slot,
       g.game_id, g.game_date,
       (g.tip_utc AT TIME ZONE 'America/Chicago') AS tip_central,
       CASE WHEN g.home_team = nba_tricode(p.nba_team) THEN 'vs ' || g.away_team
            ELSE '@ ' || g.home_team END AS opponent,
       CASE g.status WHEN 1 THEN 'Scheduled' WHEN 2 THEN 'In Progress' ELSE 'Final' END AS status
FROM rosters r
JOIN teams t   ON t.team_id = r.team_id
JOIN players p ON p.player_id = r.player_id
JOIN games g   ON nba_tricode(p.nba_team) IN (g.home_team, g.away_team)
WHERE g.game_date >= (now() AT TIME ZONE 'America/Chicago')::date
  AND NOT g.postponed;

-- Games per fantasy team per day, active slots only: "4 games tonight".
CREATE VIEW report_team_games_by_day AS
SELECT team_id, team_name, abv, game_date, count(*) FILTER (WHERE slot = 'active') AS active_games,
       count(*) AS all_games
FROM report_team_schedule
GROUP BY team_id, team_name, abv, game_date;

-- Each player's rank in the latest run of every heat ranking (weekly/minutes x fantasy/nba).
CREATE VIEW latest_heat_ranks AS
SELECT DISTINCT ON (pr.ranking, coalesce(pr.nba_person_id::text, lower(pr.player_name)))
       pr.ranking, pr.rank, pr.player_name, pr.nba_person_id, pr.run_date
FROM power_rankings pr
JOIN (SELECT ranking, max(run_date) AS run_date FROM power_rankings GROUP BY ranking) latest USING (ranking, run_date)
ORDER BY pr.ranking, coalesce(pr.nba_person_id::text, lower(pr.player_name)), pr.rank;

CREATE OR REPLACE VIEW report_freshness AS
SELECT 'standings' AS dataset, max(last_updated) AS last_updated FROM standings
UNION ALL SELECT 'rosters', max(updated_at) FROM rosters
UNION ALL SELECT 'scores', max(created_at) FROM scoring_ledger
UNION ALL SELECT 'transactions', max(created_at) FROM transactions
UNION ALL SELECT 'power_rankings', max(created_at) FROM power_rankings
UNION ALL SELECT 'schedule', max(updated_at) FROM games;

COMMIT;
