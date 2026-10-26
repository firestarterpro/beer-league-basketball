-- 006_reports.sql
-- Power rankings storage, Scrub of the Week, injury report, and the report_*
-- views Looker Studio connects to (one Looker data source per view).

BEGIN;

-- ---------------------------------------------------------------
-- Power rankings: results of the LM's model (build_model.py), loaded by
-- sync/publish_rankings.py. One row per player per ranking per run.
-- ranking: weekly_nba / weekly_fantasy / minutes_nba / minutes_fantasy
-- ---------------------------------------------------------------
CREATE TABLE power_rankings (
    run_date       date NOT NULL,
    ranking        text NOT NULL,
    rank           integer NOT NULL,
    player_name    text NOT NULL,
    nba_team       text,
    nba_person_id  integer,
    score          numeric,
    extras         jsonb NOT NULL DEFAULT '{}',   -- any other model columns, kept as-is
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (run_date, ranking, rank)
);

-- ---------------------------------------------------------------
-- Scrub of the Week: top Tier 3 scorers on fantasy rosters over the last
-- 7 days (active scoring model). The LM turns the top 5 into a poll.
-- ---------------------------------------------------------------
CREATE VIEW scrub_candidates AS
SELECT rt.player_id, rt.player_name, rt.team_name, rt.nba_team,
       count(f.ledger_id) AS games,
       sum(f.fantasy_points) AS points_last_7_days
FROM roster_tiers rt
JOIN fantasy_points_by_model f ON f.player_id = rt.player_id
WHERE rt.tier = 'T3'
  AND f.game_date > current_date - 7
  AND f.model_key = (SELECT setting_value FROM league_settings WHERE setting_key = 'scoring_model')
GROUP BY rt.player_id, rt.player_name, rt.team_name, rt.nba_team
ORDER BY points_last_7_days DESC;

CREATE FUNCTION create_scrub_poll() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    v_options text[];
    v_poll uuid;
BEGIN
    SELECT array_agg(format('%s (%s) · %s pts', player_name, team_name, round(points_last_7_days)))
    INTO v_options
    FROM (SELECT * FROM scrub_candidates LIMIT 5) top5;
    IF coalesce(array_length(v_options, 1), 0) < 2 THEN
        RAISE EXCEPTION 'Not enough Tier 3 games in the last 7 days to make a poll yet';
    END IF;
    v_poll := create_poll(format('Scrub of the Week (%s)', to_char(current_date, 'Mon DD')),
                          'single_choice', v_options,
                          'Top Tier 3 scorers on fantasy rosters over the last 7 days. Pick your favorite.',
                          NULL, 'scrub_nominee');
    PERFORM post_note('Scrub of the Week voting is open.', ARRAY['scrub_of_the_week', 'vote_open']);
    RETURN v_poll;
END $$;

-- ---------------------------------------------------------------
-- Report views for Looker Studio
-- ---------------------------------------------------------------
CREATE VIEW report_standings AS
SELECT s.rank, t.team_name, t.abv, t.gm_name, s.total_points, s.last_updated,
       b.badge, b.t1_count, b.t2_count, b.t3_count, b.roster_size,
       CASE b.badge WHEN 'Power Play' THEN '⚡ Power Play' ELSE b.badge END AS badge_label
FROM standings s
JOIN teams t USING (team_id)
LEFT JOIN team_badges b USING (team_id)
WHERE t.active;

CREATE VIEW report_rosters AS
SELECT rt.team_name, rt.player_name, rt.nba_team, array_to_string(rt.positions, '/') AS positions,
       rt.slot, rt.position_slot, rt.tier, rt.rank AS tier_rank, rt.counts_toward_cap,
       rt.acquired_via, rt.acquired_date, p.status AS injury_status, p.injury_note,
       b.badge AS team_badge,
       CASE b.badge WHEN 'Power Play' THEN '⚡ Power Play' ELSE b.badge END AS team_badge_label,
       (SELECT version FROM current_tier_snapshot) AS tier_snapshot_version
FROM roster_tiers rt
JOIN players p USING (player_id)
LEFT JOIN team_badges b USING (team_id);

CREATE VIEW report_tier_list AS
SELECT ct.rank, ct.tier, p.name AS player_name, p.nba_team, array_to_string(p.positions, '/') AS positions,
       coalesce(t.team_name, 'Free agent') AS fantasy_team, ct.snapshot_version, ct.effective_date
FROM current_tiers ct
JOIN players p USING (player_id)
LEFT JOIN rosters r USING (player_id)
LEFT JOIN teams t ON t.team_id = r.team_id;

-- Every snapshot, for tier-history charts (snapshot version control in Looker).
CREATE VIEW report_tier_history AS
SELECT s.version AS snapshot_version, s.effective_date, ta.rank, ta.tier, p.name AS player_name, p.nba_team
FROM tier_assignments ta
JOIN tier_snapshots s USING (snapshot_id)
JOIN players p USING (player_id);

CREATE VIEW report_transactions AS
SELECT x."timestamp", x.type, t.team_name, p.name AS player_name, x.source, x.lm_action,
       x.details->>'player_name' AS espn_player_name
FROM transactions x
LEFT JOIN teams t USING (team_id)
LEFT JOIN players p USING (player_id);

CREATE VIEW report_scoring_leaders AS
SELECT f.game_date, f.model_key, p.name AS player_name, p.nba_team,
       coalesce(ct.tier, 'T3') AS tier, coalesce(t.team_name, 'Free agent') AS fantasy_team,
       f.fantasy_points
FROM fantasy_points_by_model f
JOIN players p USING (player_id)
LEFT JOIN current_tiers ct USING (player_id)
LEFT JOIN rosters r USING (player_id)
LEFT JOIN teams t ON t.team_id = r.team_id;

CREATE VIEW report_team_points_by_model AS
SELECT team_name, model_key, total_points FROM team_points_by_model;

CREATE VIEW report_draft AS
SELECT d."timestamp", t.team_name, p.name AS player_name, d.bid, d.budget_remaining,
       coalesce(ct.tier, 'T3') AS tier
FROM draft_board d
JOIN teams t USING (team_id)
JOIN players p USING (player_id)
LEFT JOIN current_tiers ct USING (player_id);

CREATE VIEW report_rulebook AS
SELECT section, text, version, effective_date, source_doc FROM rulebook;

CREATE VIEW report_injuries AS
SELECT p.name AS player_name, p.nba_team, p.status, p.injury_note, p.updated_at,
       t.team_name AS fantasy_team, r.slot, coalesce(ct.tier, 'T3') AS tier
FROM players p
JOIN rosters r USING (player_id)
JOIN teams t ON t.team_id = r.team_id
LEFT JOIN current_tiers ct USING (player_id)
WHERE coalesce(p.status, 'ACTIVE') <> 'ACTIVE';

CREATE VIEW report_power_rankings AS
SELECT pr.run_date, pr.ranking, pr.rank, pr.player_name, pr.nba_team, pr.score,
       coalesce(t.team_name, 'Free agent') AS fantasy_team,
       pr.run_date = (SELECT max(run_date) FROM power_rankings) AS is_latest
FROM power_rankings pr
LEFT JOIN players p ON p.nba_person_id = pr.nba_person_id
LEFT JOIN rosters r ON r.player_id = p.player_id
LEFT JOIN teams t ON t.team_id = r.team_id;

CREATE VIEW report_defense AS
SELECT g.game_date, coalesce(p.name, n.name) AS player_name, g.minutes, g.deflections, g.contested_shots,
       g.charges_drawn, g.box_outs, g.loose_balls, g.dfg_made, g.dfg_attempted, g.rim_dfg_made, g.rim_dfg_attempted
FROM nba_tracking_games g
LEFT JOIN players p ON p.nba_person_id = g.nba_person_id
LEFT JOIN nba_people n ON n.nba_person_id = g.nba_person_id;

CREATE VIEW report_poll_results AS
SELECT p.question, p.type, p.context_type, o.label, o.votes, p.closed_by IS NOT NULL AS closed, p.created_at
FROM polls p
JOIN poll_option_counts o ON o.poll_id = p.id;

-- Freshness, so the report can show when data last synced.
CREATE VIEW report_freshness AS
SELECT 'standings' AS dataset, max(last_updated) AS last_updated FROM standings
UNION ALL SELECT 'rosters', max(updated_at) FROM rosters
UNION ALL SELECT 'scores', max(created_at) FROM scoring_ledger
UNION ALL SELECT 'transactions', max(created_at) FROM transactions
UNION ALL SELECT 'power_rankings', max(created_at) FROM power_rankings;

COMMIT;
