-- 012_player_stats.sql
-- Season stats for EVERY player in ESPN's pool, not just rostered ones, so the
-- Tiers table and player cards work before the draft. espn_sync.py fills it
-- with each nightly players pull. scoring_ledger (per game, rostered only) is unchanged.
BEGIN;

-- One row per player per ESPN stat window.
-- split: season / last7 / last15 / last30 / projected
-- totals keys match scoring_ledger.stat_line, plus dd td qd (games with a
-- double-, triple-, quadruple-double), gp and gs (games played / started).
CREATE TABLE player_stats (
    player_id     text NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    split         text NOT NULL CHECK (split IN ('season', 'last7', 'last15', 'last30', 'projected')),
    games         integer NOT NULL DEFAULT 0,
    totals        jsonb NOT NULL DEFAULT '{}',
    espn_points   numeric,              -- ESPN's own total under the league's ESPN scoring
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, split)
);

-- Fantasy points for every model from those totals, the same rules as
-- fantasy_points_by_model: bonuses don't stack, a QD in a model with no QD
-- value earns its TD bonus. ESPN counts a triple-double game as a double-double
-- too (dd includes td, td includes qd), so each game is paid once at its highest bonus.
CREATE VIEW player_stat_points AS
WITH s AS (
    SELECT ps.player_id, ps.split, ps.games,
           ps.totals
             || jsonb_build_object(
                  'tpmi', coalesce((ps.totals->>'tpa')::numeric, 0) - coalesce((ps.totals->>'tpm')::numeric, 0),
                  'reb',  coalesce((ps.totals->>'reb')::numeric,
                                   coalesce((ps.totals->>'oreb')::numeric, 0) + coalesce((ps.totals->>'dreb')::numeric, 0))
                ) AS st
    FROM player_stats ps
),
b AS (
    SELECT s.*,
           greatest(coalesce((st->>'qd')::numeric, 0), 0) AS qd_games,
           greatest(coalesce((st->>'td')::numeric, 0) - coalesce((st->>'qd')::numeric, 0), 0) AS td_games,
           greatest(coalesce((st->>'dd')::numeric, 0) - coalesce((st->>'td')::numeric, 0), 0) AS dd_games
    FROM s
)
SELECT b.player_id, b.split, b.games, m.model_key,
       (SELECT coalesce(sum(sm.points * coalesce((b.st->>sm.stat)::numeric, 0)), 0)
        FROM scoring_models sm WHERE sm.model_key = m.model_key AND sm.stat NOT IN ('dd', 'td', 'qd'))
     + b.dd_games * coalesce(m.dd, 0)
     + b.td_games * coalesce(m.td, m.dd, 0)
     + b.qd_games * coalesce(m.qd, m.td, m.dd, 0) AS fantasy_points
FROM b
CROSS JOIN (
    SELECT model_key,
           max(points) FILTER (WHERE stat = 'dd') AS dd,
           max(points) FILTER (WHERE stat = 'td') AS td,
           max(points) FILTER (WHERE stat = 'qd') AS qd
    FROM scoring_models GROUP BY model_key
) m;

-- NBA.com defensive tracking per player, season to date (only players linked to an NBA id).
CREATE VIEW player_defense AS
SELECT p.player_id, count(*) AS games, sum(g.minutes) AS minutes,
       sum(g.deflections) AS deflections, sum(g.contested_shots) AS contests,
       sum(g.charges_drawn) AS charges, sum(g.box_outs) AS box_outs, sum(g.loose_balls) AS loose_balls,
       sum(g.dfg_made) AS dfg_made, sum(g.dfg_attempted) AS dfg_attempted,
       sum(g.rim_dfg_made) AS rim_dfg_made, sum(g.rim_dfg_attempted) AS rim_dfg_attempted
FROM nba_tracking_games g
JOIN players p ON p.nba_person_id = g.nba_person_id
GROUP BY p.player_id;

COMMIT;
