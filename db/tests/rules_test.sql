-- rules_test.sql
-- Checks the league rules in the views against hand-worked examples.
-- Runs inside a transaction and rolls back, so it never leaves data behind.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/rules_test.sql

BEGIN;

CREATE TEMP TABLE results (test text, ok boolean, detail text);

-- ---------- fixtures ----------
INSERT INTO tier_snapshots (version, effective_date, notes) VALUES (9001, '2026-10-01', 'test');   -- high version: wins over real snapshots, never collides

INSERT INTO players (player_id, name) SELECT 'p' || g, 'Player ' || g FROM generate_series(1, 30) g;
-- ranks: p1-p20 = rank 1-20 (T1), p21-p25 = rank 30-34 (T2), p26-p30 = rank 100+ (T3)
INSERT INTO tier_assignments (snapshot_id, player_id, rank)
SELECT (SELECT snapshot_id FROM tier_snapshots WHERE version = 9001), 'p' || g,
       CASE WHEN g <= 20 THEN g WHEN g <= 25 THEN g + 9 ELSE g + 74 END
FROM generate_series(1, 30) g;

CREATE TEMP TABLE t AS SELECT abv, team_id FROM teams;
-- The vote maths below is worked for the 4 original GMs; the real league has more (rolled back at the end).
UPDATE teams SET manager_assigned = (abv IN ('FLAG', 'LBA', 'STAT', 'JME'));

-- LBA: 3 T1 + 1 T3 -> Legal
INSERT INTO rosters (team_id, player_id, slot, acquired_date, acquired_via)
SELECT (SELECT team_id FROM t WHERE abv = 'LBA'), p, 'active', '2026-10-10', 'draft'
FROM unnest(ARRAY['p1', 'p2', 'p3', 'p26']) p;

-- SS: 3 T1 drafted, 4th T1 by trade -> Power Play
INSERT INTO rosters (team_id, player_id, slot, acquired_date, acquired_via)
SELECT (SELECT team_id FROM t WHERE abv = 'STAT'), p, 'active', '2026-10-10', 'draft'
FROM unnest(ARRAY['p4', 'p5', 'p6']) p;
INSERT INTO rosters (team_id, player_id, slot, acquired_date, acquired_via)
VALUES ((SELECT team_id FROM t WHERE abv = 'STAT'), 'p7', 'active', '2026-10-15', 'trade');

-- JME: 3 T1 drafted, 4th T1 as free agent -> Violation until approved
INSERT INTO rosters (team_id, player_id, slot, acquired_date, acquired_via)
SELECT (SELECT team_id FROM t WHERE abv = 'JME'), p, 'active', '2026-10-10', 'draft'
FROM unnest(ARRAY['p8', 'p9', 'p10']) p;
INSERT INTO rosters (team_id, player_id, slot, acquired_date, acquired_via)
VALUES ((SELECT team_id FROM t WHERE abv = 'JME'), 'p11', 'bench', '2026-10-20', 'free_agent');
INSERT INTO restricted_fa_claims (team_id, player_id) VALUES ((SELECT team_id FROM t WHERE abv = 'JME'), 'p11');

-- T4: 3 T1 + a 4th T1 on IR -> Legal (IR doesn't count)
INSERT INTO rosters (team_id, player_id, slot, acquired_date, acquired_via)
SELECT (SELECT team_id FROM t WHERE abv = 'FLAG'), p, 'active', '2026-10-10', 'draft'
FROM unnest(ARRAY['p12', 'p13', 'p14']) p;
INSERT INTO rosters (team_id, player_id, slot, acquired_date, acquired_via)
VALUES ((SELECT team_id FROM t WHERE abv = 'FLAG'), 'p15', 'IR', '2026-10-10', 'draft');

-- T5: 4 T1 drafted BEFORE the tier snapshot took effect -> refresh caused it -> Power Play
INSERT INTO rosters (team_id, player_id, slot, acquired_date, acquired_via)
SELECT (SELECT team_id FROM t WHERE abv = 'MPS'), p, 'active', '2026-09-25', 'draft'
FROM unnest(ARRAY['p16', 'p17', 'p18', 'p19']) p;

-- T6: 4 T2 straight out of the draft -> draft_overage_badge setting (Power Play)
INSERT INTO rosters (team_id, player_id, slot, acquired_date, acquired_via)
SELECT (SELECT team_id FROM t WHERE abv = 'CCT'), p, 'active', '2026-10-10', 'draft'
FROM unnest(ARRAY['p21', 'p22', 'p23', 'p24']) p;

-- ---------- badges ----------
INSERT INTO results
SELECT 'badge ' || abv, badge = expected, 'got ' || badge || ', want ' || expected
FROM team_badges JOIN t USING (team_id)
JOIN (VALUES ('LBA', 'Legal'), ('STAT', 'Power Play'), ('JME', 'Violation'),
             ('FLAG', 'Legal'), ('MPS', 'Power Play'), ('CCT', 'Power Play')) e(abv, expected) USING (abv);

UPDATE restricted_fa_claims SET status = 'approved' WHERE player_id = 'p11';
INSERT INTO results
SELECT 'badge JME after approved vote', badge = 'Power Play', badge FROM team_badges JOIN t USING (team_id) WHERE abv = 'JME';

UPDATE restricted_fa_claims SET status = 'overridden', lm_override = 'denied_override', override_reason = 'test' WHERE player_id = 'p11';
INSERT INTO results
SELECT 'badge JME after denied override', badge = 'Violation', badge FROM team_badges JOIN t USING (team_id) WHERE abv = 'JME';

UPDATE restricted_fa_claims SET lm_override = 'approved_override' WHERE player_id = 'p11';
INSERT INTO results
SELECT 'badge JME after approved override', badge = 'Power Play', badge FROM team_badges JOIN t USING (team_id) WHERE abv = 'JME';

-- Non-compliant IR activation on T4, vote pending -> Violation
UPDATE rosters SET slot = 'bench' WHERE player_id = 'p15';
INSERT INTO ir_activations (team_id, player_id, to_slot, resulting_t1_count, is_compliant)
VALUES ((SELECT team_id FROM t WHERE abv = 'FLAG'), 'p15', 'bench', 4, false);
INSERT INTO results
SELECT 'badge FLAG after IR activation (pending)', badge = 'Violation', badge FROM team_badges JOIN t USING (team_id) WHERE abv = 'FLAG';

-- ---------- vote threshold ----------
INSERT INTO results SELECT 'threshold at 4 managers', vote_threshold() = 3, vote_threshold()::text;
UPDATE teams SET manager_assigned = true WHERE abv IN ('CCT', 'BBT');
INSERT INTO results SELECT 'threshold at 6 managers', vote_threshold() = 4, vote_threshold()::text;
UPDATE teams SET manager_assigned = true WHERE abv = 'MPS';
INSERT INTO results SELECT 'threshold at 7 managers', vote_threshold() = 4, vote_threshold()::text;
UPDATE teams SET manager_assigned = (abv IN ('FLAG', 'LBA', 'STAT', 'JME'));

-- ---------- fantasy points (worked by hand) ----------
-- 20 pts, 8-15 FG, 2-2 FT, 2-5 3PT, 2 OREB + 8 DREB, 10 AST, 1 STL, 3 TO, 2 PF, team win.
-- Triple-double (PTS/REB/AST). Expected: hustle 109, espn_default 51, balanced 79.
INSERT INTO scoring_ledger (player_id, game_id, game_date, stat_line) VALUES
    ('p1', 'g1', '2026-10-21',
     '{"pts":20,"fgm":8,"fga":15,"ftm":2,"fta":2,"tpm":2,"tpa":5,"oreb":2,"dreb":8,"ast":10,"stl":1,"blk":0,"tov":3,"pf":2,"team_win":1}');
INSERT INTO results
SELECT 'points ' || model_key, fantasy_points = expected, 'got ' || fantasy_points || ', want ' || expected
FROM fantasy_points_by_model
JOIN (VALUES ('hustle', 109), ('espn_default', 51), ('balanced', 79)) e(model_key, expected) USING (model_key)
WHERE game_id = 'g1';

-- Quadruple-double: hustle takes QD 20 only (not 5+8+20); balanced has no QD, takes TD 5.
INSERT INTO scoring_ledger (player_id, game_id, game_date, stat_line) VALUES
    ('p2', 'g2', '2026-10-21', '{"pts":10,"reb":10,"ast":10,"stl":10}');
INSERT INTO results
SELECT 'QD bonus ' || model_key, fantasy_points = expected, 'got ' || fantasy_points || ', want ' || expected
FROM fantasy_points_by_model
JOIN (VALUES ('hustle', 20 + 40 + 70 + 20), ('balanced', 15 + 15 + 30 + 50 + 5)) e(model_key, expected) USING (model_key)
WHERE game_id = 'g2';
-- hustle: pts 10*2=20, reb counts only as oreb/dreb (none given) so 0, ast 40, stl 70, QD 20 = 150

-- ---------- ranked poll ----------
INSERT INTO polls (id, question, type) VALUES ('00000000-0000-0000-0000-000000000001', 'Rank these', 'ranked');
INSERT INTO poll_options (id, poll_id, label) VALUES
    ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'A'),
    ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000001', 'B'),
    ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000001', 'C');
INSERT INTO poll_responses (poll_id, team_id, response_json)
SELECT '00000000-0000-0000-0000-000000000001', (SELECT team_id FROM t WHERE abv = x.abv), x.j::jsonb
FROM (VALUES
  ('LBA', '{"ranking":["00000000-0000-0000-0000-00000000000a","00000000-0000-0000-0000-00000000000b","00000000-0000-0000-0000-00000000000c"]}'),
  ('STAT',  '{"ranking":["00000000-0000-0000-0000-00000000000b","00000000-0000-0000-0000-00000000000a","00000000-0000-0000-0000-00000000000c"]}'),
  ('JME', '{"ranking":["00000000-0000-0000-0000-00000000000a","00000000-0000-0000-0000-00000000000c","00000000-0000-0000-0000-00000000000b"]}')
) x(abv, j);
INSERT INTO results
SELECT 'ranked ' || label, average_rank = avg_want AND first_place_votes = first_want,
       'avg ' || average_rank || ' first ' || first_place_votes
FROM poll_ranked_results
JOIN (VALUES ('A', 1.33, 2), ('B', 2.00, 1), ('C', 2.67, 0)) e(label, avg_want, first_want) USING (label);

-- ---------- claim vote tally ----------
INSERT INTO polls (id, question, type, context_type) VALUES ('00000000-0000-0000-0000-000000000002', 'Approve?', 'single_choice', 'claim_approval');
INSERT INTO poll_options (id, poll_id, label) VALUES
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002', 'Yes'),
    ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000002', 'No');
INSERT INTO poll_responses (poll_id, team_id, response_json, is_auto_yes)
SELECT '00000000-0000-0000-0000-000000000002', (SELECT team_id FROM t WHERE abv = x.abv),
       jsonb_build_object('option_id', x.opt), x.auto
FROM (VALUES ('JME', '00000000-0000-0000-0000-0000000000a1', true),
             ('LBA', '00000000-0000-0000-0000-0000000000a1', false),
             ('STAT',  '00000000-0000-0000-0000-0000000000a2', false)) x(abv, opt, auto);
INSERT INTO results
SELECT 'claim 2 yes of 3 needed', NOT community_approved, yes_votes || '/' || threshold FROM claim_vote_tally
WHERE poll_id = '00000000-0000-0000-0000-000000000002';
INSERT INTO poll_responses (poll_id, team_id, response_json)
VALUES ('00000000-0000-0000-0000-000000000002', (SELECT team_id FROM t WHERE abv = 'FLAG'),
        '{"option_id":"00000000-0000-0000-0000-0000000000a1"}');
INSERT INTO results
SELECT 'claim 3 yes of 3 needed', community_approved, yes_votes || '/' || threshold FROM claim_vote_tally
WHERE poll_id = '00000000-0000-0000-0000-000000000002';

-- ---------- guards ----------
DO $$
BEGIN
    BEGIN
        INSERT INTO action_requests (team_id, action_type, payload)
        VALUES ((SELECT team_id FROM teams WHERE abv = 'LBA'), 'add_player', '{"player_id":"p30"}');
        INSERT INTO results VALUES ('queue blocks teams not opted in', false, 'insert succeeded');
    EXCEPTION WHEN raise_exception THEN
        INSERT INTO results VALUES ('queue blocks teams not opted in', true, 'blocked');
    END;
    UPDATE teams SET uses_web_actions = true WHERE abv = 'LBA';
    INSERT INTO action_requests (team_id, action_type, payload)
    VALUES ((SELECT team_id FROM teams WHERE abv = 'LBA'), 'add_player', '{"player_id":"p30"}');
    INSERT INTO results SELECT 'queue accepts opted-in team', status = 'pending', status
    FROM action_requests WHERE payload->>'player_id' = 'p30';
    BEGIN
        INSERT INTO action_requests (team_id, action_type, payload)
        VALUES ((SELECT team_id FROM teams WHERE abv = 'LBA'), 'trade_proposal', '{}');
        INSERT INTO results VALUES ('queue rejects trade proposals', false, 'insert succeeded');
    EXCEPTION WHEN check_violation THEN
        INSERT INTO results VALUES ('queue rejects trade proposals', true, 'blocked');
    END;
    BEGIN
        INSERT INTO transactions (type, player_id) VALUES ('add', 'p30');
        UPDATE transactions SET details = '{"x":1}' WHERE player_id = 'p30';
        INSERT INTO results VALUES ('transactions are append-only', false, 'update succeeded');
    EXCEPTION WHEN raise_exception THEN
        INSERT INTO results VALUES ('transactions are append-only', true, 'blocked');
    END;
END $$;

-- ---------- report ----------
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, test, detail FROM results ORDER BY ok, test;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM results;

ROLLBACK;
