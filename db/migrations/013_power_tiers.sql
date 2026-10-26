-- 013_power_tiers.sql
-- Tiers come from Jason's power ranking (2026-10-23), room for a 7th team,
-- and "moved up / down since last time" for tiers and every heat ranking.
BEGIN;

INSERT INTO league_settings (setting_key, setting_value, source) VALUES
    -- Which power ranking orders the tiers: weekly_nba / minutes_nba / weekly_fantasy /
    -- minutes_fantasy / avg_nba (average of the two NBA-model ranks). Jason picked Weekly Power,
    -- NBA model (Game Score + the NBA.com defensive stats) on 2026-10-24.
    ('tier_ranking', 'weekly_nba', 'lm_decision'),
    ('max_teams',    '7',   'lm_decision')
ON CONFLICT (setting_key) DO NOTHING;

-- 7 teams confirmed (Jason, 2026-10-24); Team 7 waits for its GM like Teams 5 and 6. When one joins:
-- UPDATE teams SET team_name = '...', gm_name = '...', manager_assigned = true WHERE abv = 'TM7';
INSERT INTO teams (team_name, abv, active, manager_assigned) VALUES ('Team 7', 'TM7', true, false)
ON CONFLICT (abv) DO UPDATE SET active = true;
INSERT INTO standings (team_id, total_points)
SELECT team_id, 0 FROM teams WHERE abv = 'TM7'
ON CONFLICT (team_id) DO NOTHING;

-- What each tier snapshot was built from: 'espn' (ESPN projection rank) or a ranking key.
ALTER TABLE tier_snapshots ADD COLUMN source text NOT NULL DEFAULT 'espn';
ALTER TABLE tier_snapshots ADD COLUMN ranking_run_date date;
-- The view was built with SELECT *, which froze its column list: re-create it to pick up the new columns.
CREATE OR REPLACE VIEW current_tier_snapshot AS
SELECT * FROM tier_snapshots WHERE effective_date <= current_date ORDER BY version DESC LIMIT 1;

-- Each player's rank in the current tier snapshot vs the one before it.
CREATE VIEW tier_moves AS
WITH s AS (
    SELECT snapshot_id, version, row_number() OVER (ORDER BY version DESC) AS n
    FROM tier_snapshots WHERE effective_date <= current_date)
SELECT cur.player_id, cur.rank, cur.tier, prev.rank AS prev_rank, prev.tier AS prev_tier,
       (SELECT version FROM s WHERE n = 2) AS prev_version
FROM tier_assignments cur
JOIN s sc ON sc.snapshot_id = cur.snapshot_id AND sc.n = 1
LEFT JOIN tier_assignments prev
       ON prev.player_id = cur.player_id
      AND prev.snapshot_id = (SELECT snapshot_id FROM s WHERE n = 2);

-- Each heat ranking: the latest run vs the run before it (rank and score).
CREATE VIEW heat_rank_moves AS
WITH runs AS (
    SELECT ranking, run_date, dense_rank() OVER (PARTITION BY ranking ORDER BY run_date DESC) AS n
    FROM (SELECT DISTINCT ranking, run_date FROM power_rankings) r),
pr AS (
    SELECT pr.*, runs.n, coalesce(pr.nba_person_id::text, lower(pr.player_name)) AS who
    FROM power_rankings pr JOIN runs USING (ranking, run_date) WHERE runs.n <= 2)
SELECT cur.ranking, cur.run_date, cur.rank, cur.score, cur.player_name, cur.nba_person_id,
       prev.run_date AS prev_run_date, prev.rank AS prev_rank, prev.score AS prev_score
FROM pr cur
LEFT JOIN pr prev ON prev.ranking = cur.ranking AND prev.who = cur.who AND prev.n = 2
WHERE cur.n = 1;

COMMIT;
