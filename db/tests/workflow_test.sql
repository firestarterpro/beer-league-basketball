-- workflow_test.sql
-- Exercises the workflow functions in 005_functions.sql end to end.
-- Runs in a transaction and rolls back.

BEGIN;
CREATE TEMP TABLE results (test text, ok boolean, detail text);
CREATE TEMP TABLE t AS SELECT abv, team_id FROM teams;
-- Claim votes below are worked for the 4 original GMs (3 yes votes pass); rolled back at the end.
UPDATE teams SET manager_assigned = (abv IN ('FLAG', 'LBA', 'STAT', 'JME'));
CREATE FUNCTION pg_temp.team(a text) RETURNS uuid LANGUAGE sql AS $$ SELECT team_id FROM t WHERE abv = a $$;

INSERT INTO tier_snapshots (version, effective_date) VALUES (9002, current_date - 1);   -- high version: wins over real snapshots, never collides
INSERT INTO players (player_id, name) SELECT 'p' || g, 'Player ' || g FROM generate_series(1, 10) g;
INSERT INTO tier_assignments (snapshot_id, player_id, rank)
SELECT (SELECT snapshot_id FROM tier_snapshots WHERE version = 9002), 'p' || g, g FROM generate_series(1, 10) g;   -- all T1
INSERT INTO rosters (team_id, player_id, slot, acquired_date, acquired_via)
SELECT pg_temp.team('JME'), p, s, current_date - 5, 'draft'
FROM (VALUES ('p1', 'active'), ('p2', 'active'), ('p3', 'active'), ('p4', 'IR')) v(p, s);

-- ---------- generic polls ----------
DO $$
DECLARE
    v_poll uuid := create_poll('Best snack?', 'single_choice', ARRAY['Wings', 'Nachos']);
    v_wings text := (SELECT id::text FROM poll_options WHERE poll_id = v_poll AND label = 'Wings');
    v_nachos text := (SELECT id::text FROM poll_options WHERE poll_id = v_poll AND label = 'Nachos');
BEGIN
    PERFORM cast_ballot(v_poll, pg_temp.team('LBA'), jsonb_build_object('option_id', v_wings));
    PERFORM cast_ballot(v_poll, pg_temp.team('STAT'), jsonb_build_object('option_id', v_wings));
    PERFORM cast_ballot(v_poll, pg_temp.team('STAT'), jsonb_build_object('option_id', v_nachos));  -- edit
    INSERT INTO results SELECT 'ballot edit replaces vote', count(*) = 2 AND sum(votes) = 2, string_agg(label || '=' || votes, ',')
    FROM poll_option_counts WHERE poll_id = v_poll;
    BEGIN
        PERFORM cast_ballot(v_poll, pg_temp.team('JME'), '{"option_id":"not-an-option"}');
        INSERT INTO results VALUES ('rejects bad option', false, 'accepted');
    EXCEPTION WHEN raise_exception THEN INSERT INTO results VALUES ('rejects bad option', true, SQLERRM);
    END;
    INSERT INTO results VALUES ('single-choice tie lists both', close_poll(v_poll) = 'closed', '');
    INSERT INTO results SELECT 'poll_results winner', winner = 'Wings / Nachos', winner FROM poll_results WHERE poll_id = v_poll;
    BEGIN
        PERFORM cast_ballot(v_poll, pg_temp.team('JME'), jsonb_build_object('option_id', v_wings));
        INSERT INTO results VALUES ('closed poll rejects votes', false, 'accepted');
    EXCEPTION WHEN raise_exception THEN INSERT INTO results VALUES ('closed poll rejects votes', true, SQLERRM);
    END;
END $$;

DO $$
DECLARE
    v_poll uuid := create_poll('How fun is the league?', 'rating', ARRAY[]::text[]);
BEGIN
    PERFORM cast_ballot(v_poll, pg_temp.team('LBA'), '{"rating":5}');
    PERFORM cast_ballot(v_poll, pg_temp.team('STAT'), '{"rating":4}');
    INSERT INTO results SELECT 'rating average', average_rating = 4.5, average_rating::text FROM poll_rating_results WHERE poll_id = v_poll;
    BEGIN
        PERFORM cast_ballot(v_poll, pg_temp.team('JME'), '{"rating":9}');
        INSERT INTO results VALUES ('rating must be 1-5', false, 'accepted');
    EXCEPTION WHEN raise_exception THEN INSERT INTO results VALUES ('rating must be 1-5', true, SQLERRM);
    END;
END $$;

-- ---------- restricted-FA claim ----------
DO $$
DECLARE
    v_claim uuid := create_claim(pg_temp.team('JME'), 'p5');
    v_poll uuid := (SELECT poll_id FROM restricted_fa_claims WHERE id = v_claim);
    v_yes text := (SELECT id::text FROM poll_options WHERE poll_id = v_poll AND label = 'Yes');
BEGIN
    INSERT INTO results SELECT 'claim auto-yes for requester', yes_votes = 1, yes_votes::text FROM claim_vote_tally WHERE poll_id = v_poll;
    INSERT INTO results SELECT 'claim question shows tier emoji', question ~ '\((🤾|⛹️|🚶)\)\?$', question FROM polls WHERE id = v_poll;
    PERFORM cast_ballot(v_poll, pg_temp.team('LBA'), jsonb_build_object('option_id', v_yes));
    INSERT INTO results VALUES ('claim fails at 2 of 3', close_poll(v_poll) = 'failed', '');
    INSERT INTO results SELECT 'claim status failed', status = 'failed', status FROM restricted_fa_claims WHERE id = v_claim;
    PERFORM override_vote('claim_approval', v_claim, true, 'Injury replacement, family vote by text');
    INSERT INTO results SELECT 'override approves', status = 'overridden' AND lm_override = 'approved_override', status
    FROM restricted_fa_claims WHERE id = v_claim;
    INSERT INTO results SELECT 'override logged', count(*) = 1, count(*)::text FROM lm_actions WHERE type = 'vote_override';
END $$;

DO $$
DECLARE
    v_claim uuid := create_claim(pg_temp.team('JME'), 'p6');
    v_poll uuid := (SELECT poll_id FROM restricted_fa_claims WHERE id = v_claim);
    v_yes text := (SELECT id::text FROM poll_options WHERE poll_id = v_poll AND label = 'Yes');
BEGIN
    PERFORM cast_ballot(v_poll, pg_temp.team('LBA'), jsonb_build_object('option_id', v_yes));
    PERFORM cast_ballot(v_poll, pg_temp.team('STAT'), jsonb_build_object('option_id', v_yes));
    INSERT INTO results VALUES ('claim passes at 3 of 3', close_poll(v_poll) = 'approved', '');
END $$;

-- ---------- IR activation ----------
DO $$
DECLARE
    v_ir uuid := create_ir_activation(pg_temp.team('JME'), 'p4');
BEGIN
    INSERT INTO results SELECT 'IR activation over caps', NOT is_compliant AND resulting_t1_count = 4,
           resulting_t1_count::text FROM ir_activations WHERE id = v_ir;
END $$;
DELETE FROM rosters WHERE player_id = 'p1';
DO $$
DECLARE
    v_ir uuid := create_ir_activation(pg_temp.team('JME'), 'p4');
BEGIN
    INSERT INTO results SELECT 'IR activation within caps = social', is_compliant AND poll_id IS NOT NULL,
           resulting_t1_count::text FROM ir_activations WHERE id = v_ir;
END $$;

-- ---------- action queue ----------
UPDATE teams SET uses_web_actions = true WHERE abv = 'STAT';
DO $$
DECLARE
    a uuid := submit_action(pg_temp.team('STAT'), 'add_player', '{"player_id":"p7"}');
    b uuid := submit_action(pg_temp.team('STAT'), 'waiver_claim', '{"player_id":"p8","drop_player_id":"p9"}');
BEGIN
    INSERT INTO results VALUES ('heads-up when add breaks caps', NOT would_exceed_caps(pg_temp.team('STAT'), 'p7'), 'STAT has no T1 yet');
    PERFORM process_action(a, true);
    INSERT INTO results SELECT 'executed logs lm_on_behalf txn', r.status = 'executed' AND x.source = 'lm_on_behalf', x.source
    FROM action_requests r JOIN transactions x ON x.txn_id = r.resulting_transaction_id WHERE r.id = a;
    BEGIN
        PERFORM process_action(b, false, '');
        INSERT INTO results VALUES ('reject needs a reason', false, 'accepted');
    EXCEPTION WHEN raise_exception THEN INSERT INTO results VALUES ('reject needs a reason', true, SQLERRM);
    END;
    PERFORM process_action(b, false, 'Lost to higher waiver priority');
    INSERT INTO results SELECT 'rejected with reason', status = 'rejected', lm_notes FROM action_requests WHERE id = b;
    BEGIN
        PERFORM process_action(b, true);
        INSERT INTO results VALUES ('no re-processing', false, 'accepted');
    EXCEPTION WHEN raise_exception THEN INSERT INTO results VALUES ('no re-processing', true, SQLERRM);
    END;
END $$;

INSERT INTO results SELECT 'notes feed entries', count(*) >= 5, count(*)::text FROM notes;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, test, detail FROM results ORDER BY ok, test;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM results;
ROLLBACK;
