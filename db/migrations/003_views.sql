-- 003_views.sql
-- Derived views: current tiers, tier badges, fantasy points for all three
-- scoring models, poll tallies and vote thresholds.
-- Looker Studio reads these views; nothing here stores data.

BEGIN;

-- ---------------------------------------------------------------
-- Tiers in force today: the newest snapshot whose effective_date has arrived.
-- ---------------------------------------------------------------
CREATE VIEW current_tier_snapshot AS
SELECT *
FROM tier_snapshots
WHERE effective_date <= current_date
ORDER BY version DESC
LIMIT 1;

CREATE VIEW current_tiers AS
SELECT ta.player_id, ta.rank, ta.tier, s.version AS snapshot_version, s.effective_date
FROM tier_assignments ta
JOIN current_tier_snapshot s USING (snapshot_id);

-- Every rostered player with their current tier. Unranked players are T3.
-- IR players don't count toward caps (activating them is what triggers a vote).
CREATE VIEW roster_tiers AS
SELECT r.team_id, t.team_name, r.player_id, p.name AS player_name, p.nba_team, p.positions,
       r.slot, r.position_slot, r.acquired_date, r.acquired_via,
       ct.rank, coalesce(ct.tier, 'T3') AS tier,
       (r.slot <> 'IR') AS counts_toward_cap
FROM rosters r
JOIN teams t USING (team_id)
JOIN players p USING (player_id)
LEFT JOIN current_tiers ct USING (player_id);

CREATE VIEW team_tier_counts AS
SELECT t.team_id, t.team_name,
       count(rt.player_id) FILTER (WHERE rt.tier = 'T1' AND rt.counts_toward_cap) AS t1_count,
       count(rt.player_id) FILTER (WHERE rt.tier = 'T2' AND rt.counts_toward_cap) AS t2_count,
       count(rt.player_id) FILTER (WHERE rt.tier = 'T3' AND rt.counts_toward_cap) AS t3_count,
       count(rt.player_id) AS roster_size
FROM teams t
LEFT JOIN roster_tiers rt USING (team_id)
WHERE t.active
GROUP BY t.team_id, t.team_name;

-- ---------------------------------------------------------------
-- Tier badges: Legal / Power Play / Violation (handoff §6)
--
-- When a team is over a cap, the badge depends on the most recent event
-- that could have pushed it over:
--   tier_refresh  -> Power Play (refreshes never penalize)
--   trade         -> Power Play (trades are exempt)
--   fa_add        -> Violation unless the restricted-FA vote for that player
--                    was approved (by vote or LM override)
--   ir_activation -> same rule, using the IR activation's outcome
--   draft         -> league_settings.draft_overage_badge (LM chose Power Play)
-- Outcome: approved / approved_override -> Power Play;
--          pending / failed / denied_override / no vote entered -> Violation.
-- ---------------------------------------------------------------
CREATE VIEW team_badges AS
WITH counts AS (
    SELECT * FROM team_tier_counts
),
premium_adds AS (       -- newest T1/T2 acquisition per team (active or bench)
    SELECT DISTINCT ON (team_id)
           team_id, player_id, acquired_date,
           CASE acquired_via WHEN 'trade' THEN 'trade'
                             WHEN 'draft' THEN 'draft'
                             ELSE 'fa_add' END AS source
    FROM roster_tiers
    WHERE tier IN ('T1', 'T2') AND counts_toward_cap
    ORDER BY team_id, acquired_date DESC NULLS LAST
),
ir_events AS (          -- newest non-compliant IR activation per team
    SELECT DISTINCT ON (team_id)
           team_id, player_id, created_at::date AS event_date, status, lm_override
    FROM ir_activations
    WHERE NOT is_compliant
    ORDER BY team_id, created_at DESC
),
events AS (
    SELECT c.team_id, e.source, e.event_date, e.player_id, e.priority
    FROM counts c
    CROSS JOIN LATERAL (
        VALUES
          ('tier_refresh', (SELECT effective_date FROM current_tier_snapshot), NULL::text, 5),
          ((SELECT source FROM premium_adds pa WHERE pa.team_id = c.team_id),
           (SELECT acquired_date FROM premium_adds pa WHERE pa.team_id = c.team_id),
           (SELECT player_id FROM premium_adds pa WHERE pa.team_id = c.team_id), 2),
          ('ir_activation',
           (SELECT event_date FROM ir_events ie WHERE ie.team_id = c.team_id),
           (SELECT player_id FROM ir_events ie WHERE ie.team_id = c.team_id), 1)
    ) AS e(source, event_date, player_id, priority)
    WHERE e.source IS NOT NULL AND e.event_date IS NOT NULL
),
last_event AS (         -- on a same-day tie, the enforced event wins
    SELECT DISTINCT ON (team_id) *
    FROM events
    ORDER BY team_id, event_date DESC, priority
),
outcome AS (
    SELECT le.team_id, le.source, le.player_id, le.event_date,
           CASE
             WHEN le.source = 'fa_add' THEN (
                 SELECT CASE WHEN c.status = 'approved' OR c.lm_override = 'approved_override'
                             THEN 'approved' ELSE 'not_approved' END
                 FROM restricted_fa_claims c
                 WHERE c.team_id = le.team_id AND c.player_id = le.player_id
                 ORDER BY c.created_at DESC LIMIT 1)
             WHEN le.source = 'ir_activation' THEN (
                 SELECT CASE WHEN ie.status = 'approved' OR ie.lm_override = 'approved_override'
                             THEN 'approved' ELSE 'not_approved' END
                 FROM ir_events ie WHERE ie.team_id = le.team_id)
           END AS vote_outcome
    FROM last_event le
)
SELECT c.team_id, c.team_name, c.t1_count, c.t2_count, c.t3_count, c.roster_size,
       (c.t1_count > 3 OR c.t2_count > 3) AS over_cap,
       o.source AS last_overage_source,
       o.player_id AS last_overage_player_id,
       CASE
         WHEN NOT (c.t1_count > 3 OR c.t2_count > 3) THEN 'Legal'
         WHEN o.source IN ('trade', 'tier_refresh') THEN 'Power Play'
         WHEN o.source IN ('fa_add', 'ir_activation') AND o.vote_outcome = 'approved' THEN 'Power Play'
         WHEN o.source = 'draft' THEN coalesce(
             (SELECT setting_value FROM league_settings WHERE setting_key = 'draft_overage_badge'), 'Violation')
         ELSE 'Violation'
       END AS badge
FROM counts c
LEFT JOIN outcome o USING (team_id);

-- ---------------------------------------------------------------
-- Fantasy points for every scoring model, computed from stat_line.
-- DD/TD/QD bonuses don't stack: only the highest applicable bonus counts.
-- A quadruple-double in a model with no QD value earns its TD bonus.
-- ---------------------------------------------------------------
CREATE VIEW fantasy_points_by_model AS
WITH s AS (
    SELECT l.id AS ledger_id, l.player_id, l.game_id, l.game_date,
           l.stat_line
             || jsonb_build_object(
                  'tpmi', coalesce((l.stat_line->>'tpa')::numeric, 0) - coalesce((l.stat_line->>'tpm')::numeric, 0),
                  'reb',  coalesce((l.stat_line->>'reb')::numeric,
                                   coalesce((l.stat_line->>'oreb')::numeric, 0) + coalesce((l.stat_line->>'dreb')::numeric, 0))
                ) AS st
    FROM scoring_ledger l
),
cats AS (               -- categories in double figures: PTS, REB, AST, STL, BLK
    SELECT s.*,
           (CASE WHEN (st->>'pts')::numeric >= 10 THEN 1 ELSE 0 END
          + CASE WHEN (st->>'reb')::numeric >= 10 THEN 1 ELSE 0 END
          + CASE WHEN coalesce((st->>'ast')::numeric, 0) >= 10 THEN 1 ELSE 0 END
          + CASE WHEN coalesce((st->>'stl')::numeric, 0) >= 10 THEN 1 ELSE 0 END
          + CASE WHEN coalesce((st->>'blk')::numeric, 0) >= 10 THEN 1 ELSE 0 END) AS double_cats
    FROM s
)
SELECT c.ledger_id, c.player_id, c.game_id, c.game_date, m.model_key,
       (SELECT coalesce(sum(sm.points * coalesce((c.st->>sm.stat)::numeric, 0)), 0)
        FROM scoring_models sm
        WHERE sm.model_key = m.model_key AND sm.stat NOT IN ('dd', 'td', 'qd'))
     + (SELECT coalesce(max(sm.points), 0)
        FROM scoring_models sm
        WHERE sm.model_key = m.model_key
          AND ((sm.stat = 'dd' AND c.double_cats >= 2)
            OR (sm.stat = 'td' AND c.double_cats >= 3)
            OR (sm.stat = 'qd' AND c.double_cats >= 4))) AS fantasy_points,
       c.double_cats
FROM cats c
CROSS JOIN (SELECT DISTINCT model_key FROM scoring_models) m;

CREATE VIEW player_season_points AS
SELECT f.player_id, p.name AS player_name, f.model_key,
       count(*) AS games, sum(f.fantasy_points) AS total_points,
       round(avg(f.fantasy_points), 1) AS avg_points
FROM fantasy_points_by_model f
JOIN players p USING (player_id)
GROUP BY f.player_id, p.name, f.model_key;

-- Team totals per model, counting only players in starting slots that day.
CREATE VIEW team_points_by_model AS
SELECT l.team_id, t.team_name, f.model_key, sum(f.fantasy_points) AS total_points
FROM lineups l
JOIN teams t USING (team_id)
JOIN fantasy_points_by_model f ON f.player_id = l.player_id AND f.game_date = l.game_date
WHERE l.position_slot NOT IN ('BE', 'IR')
GROUP BY l.team_id, t.team_name, f.model_key;

-- ---------------------------------------------------------------
-- Votes
-- Threshold = floor(active managers / 2) + 1, computed at read time so a
-- manager joining mid-poll is counted. 4 managers -> 3, 6 managers -> 4.
-- ---------------------------------------------------------------
CREATE FUNCTION vote_threshold() RETURNS integer LANGUAGE sql STABLE AS $$
    SELECT (count(*) / 2 + 1)::integer FROM teams WHERE active AND manager_assigned;
$$;

-- Counts per option for single-choice and multi-select polls.
CREATE VIEW poll_option_counts AS
SELECT o.poll_id, o.id AS option_id, o.label, o.display_order,
       count(r.id) AS votes
FROM poll_options o
LEFT JOIN poll_responses r
       ON r.poll_id = o.poll_id
      AND (r.response_json->>'option_id' = o.id::text
           OR r.response_json->'option_ids' ? o.id::text)
GROUP BY o.poll_id, o.id, o.label, o.display_order;

-- Ranked polls: average rank + first-place count. No winner is declared.
CREATE VIEW poll_ranked_results AS
SELECT o.poll_id, o.id AS option_id, o.label,
       round(avg(x.ord), 2) AS average_rank,
       count(*) FILTER (WHERE x.ord = 1) AS first_place_votes,
       count(x.ord) AS ballots_ranking_it
FROM poll_options o
JOIN polls p ON p.id = o.poll_id AND p.type = 'ranked'
LEFT JOIN poll_responses r ON r.poll_id = o.poll_id
LEFT JOIN LATERAL (
    SELECT e.ord FROM jsonb_array_elements_text(r.response_json->'ranking') WITH ORDINALITY AS e(option_id, ord)
    WHERE e.option_id = o.id::text
) x ON true
GROUP BY o.poll_id, o.id, o.label;

CREATE VIEW poll_rating_results AS
SELECT r.poll_id, round(avg((r.response_json->>'rating')::numeric), 2) AS average_rating, count(*) AS ballots
FROM poll_responses r
JOIN polls p ON p.id = r.poll_id AND p.type = 'rating'
GROUP BY r.poll_id;

-- Yes/No tally for claim and IR-activation votes against the live threshold.
CREATE VIEW claim_vote_tally AS
SELECT p.id AS poll_id, p.context_type, p.context_id, p.closed_by IS NOT NULL AS closed,
       count(r.id) FILTER (WHERE o.label ILIKE 'yes') AS yes_votes,
       count(r.id) FILTER (WHERE o.label ILIKE 'no') AS no_votes,
       vote_threshold() AS threshold,
       count(r.id) FILTER (WHERE o.label ILIKE 'yes') >= vote_threshold() AS community_approved
FROM polls p
LEFT JOIN poll_responses r ON r.poll_id = p.id
LEFT JOIN poll_options o ON o.id::text = r.response_json->>'option_id'
WHERE p.context_type IN ('claim_approval', 'ir_activation')
GROUP BY p.id, p.context_type, p.context_id, p.closed_by;

COMMIT;
