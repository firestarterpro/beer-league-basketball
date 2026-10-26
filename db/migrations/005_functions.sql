-- 005_functions.sql
-- Workflow logic lives here so the website stays thin and every rule is
-- testable in SQL (db/tests/workflow_test.sql). The site calls these
-- functions; nothing else writes votes, claims or queue rows.

BEGIN;

-- Post a feed entry. NULL author = LM / system.
CREATE FUNCTION post_note(p_body text, p_tags text[] DEFAULT '{}', p_author uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
    INSERT INTO notes (body, tags, author_team_id) VALUES (p_body, p_tags, p_author) RETURNING id;
$$;

-- ---------------------------------------------------------------
-- Polls
-- ---------------------------------------------------------------
CREATE FUNCTION create_poll(p_question text, p_type text, p_options text[],
                            p_description text DEFAULT NULL, p_closes_at timestamptz DEFAULT NULL,
                            p_context_type text DEFAULT 'generic', p_context_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    v_poll uuid;
BEGIN
    IF p_type NOT IN ('rating', 'text') AND coalesce(array_length(p_options, 1), 0) < 2 THEN
        RAISE EXCEPTION 'A % poll needs at least 2 options', p_type;
    END IF;
    INSERT INTO polls (question, description, type, closes_at, context_type, context_id)
    VALUES (p_question, p_description, p_type, p_closes_at, p_context_type, p_context_id)
    RETURNING id INTO v_poll;
    INSERT INTO poll_options (poll_id, label, display_order)
    SELECT v_poll, label, ord FROM unnest(p_options) WITH ORDINALITY AS o(label, ord);
    RETURN v_poll;
END $$;

CREATE FUNCTION poll_is_open(p_poll uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT closed_by IS NULL AND opens_at <= now() AND (closes_at IS NULL OR closes_at > now())
    FROM polls WHERE id = p_poll;
$$;

-- Cast or change a ballot. One ballot per team per poll; a second call edits it.
-- The requesting GM's auto-Yes can be changed too (it's their ballot).
CREATE FUNCTION cast_ballot(p_poll uuid, p_team uuid, p_response jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    v_type text;
    v_id uuid;
    v_valid int;
BEGIN
    SELECT type INTO v_type FROM polls WHERE id = p_poll;
    IF v_type IS NULL THEN RAISE EXCEPTION 'Poll not found'; END IF;
    IF NOT poll_is_open(p_poll) THEN RAISE EXCEPTION 'This poll is closed'; END IF;
    IF NOT EXISTS (SELECT 1 FROM teams WHERE team_id = p_team AND active) THEN
        RAISE EXCEPTION 'Unknown team';
    END IF;

    -- Shape check per poll type; option ids must belong to this poll.
    CASE v_type
      WHEN 'single_choice' THEN
        SELECT count(*) INTO v_valid FROM poll_options WHERE poll_id = p_poll AND id::text = p_response->>'option_id';
        IF v_valid <> 1 THEN RAISE EXCEPTION 'Pick one option'; END IF;
        p_response := jsonb_build_object('option_id', p_response->>'option_id');
      WHEN 'multi_select', 'ranked' THEN
        DECLARE
            k text := CASE v_type WHEN 'ranked' THEN 'ranking' ELSE 'option_ids' END;
            n int := jsonb_array_length(coalesce(p_response->k, '[]'));
        BEGIN
            SELECT count(DISTINCT e) INTO v_valid
            FROM jsonb_array_elements_text(coalesce(p_response->k, '[]')) e
            JOIN poll_options o ON o.poll_id = p_poll AND o.id::text = e;
            IF n = 0 OR v_valid <> n THEN RAISE EXCEPTION 'Pick from this poll''s options, each once'; END IF;
            p_response := jsonb_build_object(k, p_response->k);
        END;
      WHEN 'rating' THEN
        IF (p_response->>'rating')::int NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Rate from 1 to 5'; END IF;
        p_response := jsonb_build_object('rating', (p_response->>'rating')::int);
      WHEN 'text' THEN
        IF length(trim(coalesce(p_response->>'text', ''))) = 0 THEN RAISE EXCEPTION 'Write an answer'; END IF;
        p_response := jsonb_build_object('text', left(trim(p_response->>'text'), 500));
    END CASE;

    INSERT INTO poll_responses (poll_id, team_id, response_json)
    VALUES (p_poll, p_team, p_response)
    ON CONFLICT (poll_id, team_id) DO UPDATE
        SET response_json = EXCLUDED.response_json, updated_at = now(), is_auto_yes = false
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- Close a poll (LM). Claim and IR-activation votes get their outcome here,
-- using the threshold at close time. Writes the final result to poll_results.
CREATE FUNCTION close_poll(p_poll uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    p polls%ROWTYPE;
    t claim_vote_tally%ROWTYPE;
    v_outcome text := 'closed';
BEGIN
    SELECT * INTO p FROM polls WHERE id = p_poll FOR UPDATE;
    IF p.id IS NULL THEN RAISE EXCEPTION 'Poll not found'; END IF;
    IF p.closed_by IS NOT NULL THEN RAISE EXCEPTION 'Poll already closed'; END IF;

    UPDATE polls SET closed_by = 'lm', closes_at = coalesce(closes_at, now()) WHERE id = p_poll;

    IF p.context_type IN ('claim_approval', 'ir_activation') THEN
        SELECT * INTO t FROM claim_vote_tally WHERE poll_id = p_poll;
        v_outcome := CASE WHEN t.community_approved THEN 'approved' ELSE 'failed' END;
        IF p.context_type = 'claim_approval' THEN
            UPDATE restricted_fa_claims SET status = v_outcome, closed_at = now()
            WHERE id = p.context_id AND status = 'pending';
        ELSE
            UPDATE ir_activations SET status = v_outcome, closed_at = now()
            WHERE id = p.context_id AND status = 'pending';
        END IF;
        PERFORM post_note(format('Vote closed: %s. %s Yes of %s needed (%s).',
                                 p.question, t.yes_votes, t.threshold,
                                 CASE v_outcome WHEN 'approved' THEN 'Community-Approved' ELSE 'not approved' END),
                          ARRAY['vote_closed', p.context_type]);
    END IF;

    INSERT INTO poll_results (poll_id, question, options, votes, winner, closed_at)
    SELECT p.id, p.question,
           (SELECT jsonb_agg(jsonb_build_object('id', id, 'label', label) ORDER BY display_order)
              FROM poll_options WHERE poll_id = p.id),
           (SELECT jsonb_agg(jsonb_build_object('team_id', team_id, 'response', response_json, 'auto_yes', is_auto_yes))
              FROM poll_responses WHERE poll_id = p.id),
           CASE WHEN p.context_type IN ('claim_approval', 'ir_activation') THEN v_outcome
                WHEN p.type = 'single_choice' THEN
                     (SELECT string_agg(label, ' / ' ORDER BY display_order) FROM poll_option_counts c
                      WHERE c.poll_id = p.id AND c.votes > 0
                        AND c.votes = (SELECT max(votes) FROM poll_option_counts WHERE poll_id = p.id))
           END,   -- ranked polls declare no winner
           now();
    RETURN v_outcome;
END $$;

-- ---------------------------------------------------------------
-- Restricted-FA claims (LM enters them from ESPN chat)
-- ---------------------------------------------------------------
CREATE FUNCTION yes_no_vote(p_question text, p_context text, p_context_id uuid, p_team uuid, p_description text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    v_poll uuid;
BEGIN
    v_poll := create_poll(p_question, 'single_choice', ARRAY['Yes', 'No'], p_description, NULL, p_context, p_context_id);
    -- Requesting GM auto-receives Yes
    INSERT INTO poll_responses (poll_id, team_id, response_json, is_auto_yes)
    SELECT v_poll, p_team, jsonb_build_object('option_id', id), true
    FROM poll_options WHERE poll_id = v_poll AND label = 'Yes';
    RETURN v_poll;
END $$;

CREATE FUNCTION create_claim(p_team uuid, p_player text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    v_claim uuid;
    v_poll uuid;
    v_team text;
    v_player text;
    v_tier text;
BEGIN
    SELECT team_name INTO v_team FROM teams WHERE team_id = p_team;
    SELECT name INTO v_player FROM players WHERE player_id = p_player;
    IF v_team IS NULL OR v_player IS NULL THEN RAISE EXCEPTION 'Unknown team or player'; END IF;
    SELECT coalesce((SELECT tier FROM current_tiers WHERE player_id = p_player), 'T3') INTO v_tier;

    INSERT INTO restricted_fa_claims (team_id, player_id) VALUES (p_team, p_player) RETURNING id INTO v_claim;
    v_poll := yes_no_vote(format('Approve %s adding %s (%s)?', v_team, v_player, v_tier),
                          'claim_approval', v_claim, p_team,
                          'This add would put the team over its tier caps. Majority of managers approves.');
    UPDATE restricted_fa_claims SET poll_id = v_poll WHERE id = v_claim;
    PERFORM post_note(format('%s requested %s (%s). Vote is open.', v_team, v_player, v_tier),
                      ARRAY['restricted_fa', 'vote_open']);
    RETURN v_claim;
END $$;

-- ---------------------------------------------------------------
-- IR activations (LM enters them). Compliant = social confirmation only.
-- ---------------------------------------------------------------
CREATE FUNCTION create_ir_activation(p_team uuid, p_player text, p_to_slot text DEFAULT 'bench')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    v_id uuid;
    v_poll uuid;
    v_t1 int;
    v_t2 int;
    v_ok boolean;
    v_team text;
    v_player text;
BEGIN
    SELECT team_name INTO v_team FROM teams WHERE team_id = p_team;
    SELECT name INTO v_player FROM players WHERE player_id = p_player;
    IF v_team IS NULL OR v_player IS NULL THEN RAISE EXCEPTION 'Unknown team or player'; END IF;

    -- Counts after the move: everyone not on IR, plus this player.
    SELECT count(*) FILTER (WHERE tier = 'T1'), count(*) FILTER (WHERE tier = 'T2')
    INTO v_t1, v_t2
    FROM roster_tiers
    WHERE team_id = p_team AND (counts_toward_cap OR player_id = p_player);
    v_ok := v_t1 <= 3 AND v_t2 <= 3;

    INSERT INTO ir_activations (team_id, player_id, to_slot, resulting_t1_count, resulting_t2_count, is_compliant)
    VALUES (p_team, p_player, p_to_slot, v_t1, v_t2, v_ok) RETURNING id INTO v_id;

    v_poll := yes_no_vote(
        format('%s activating %s from IR?', v_team, v_player),
        'ir_activation', v_id, p_team,
        CASE WHEN v_ok THEN 'Roster stays within tier caps. This is a social confirmation, not a ruling.'
             ELSE format('Roster would have %s T1 / %s T2. Majority of managers approves.', v_t1, v_t2) END);
    UPDATE ir_activations SET poll_id = v_poll WHERE id = v_id;
    PERFORM post_note(format('%s is activating %s from IR (%s).', v_team, v_player,
                             CASE WHEN v_ok THEN 'within caps' ELSE 'over caps, vote needed' END),
                      ARRAY['ir_activation']);
    RETURN v_id;
END $$;

-- LM override either direction, logged publicly.
CREATE FUNCTION override_vote(p_context text, p_id uuid, p_approve boolean, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_override text := CASE WHEN p_approve THEN 'approved_override' ELSE 'denied_override' END;
BEGIN
    IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Give a reason for the override'; END IF;
    IF p_context = 'claim_approval' THEN
        UPDATE restricted_fa_claims SET status = 'overridden', lm_override = v_override,
               override_reason = p_reason, closed_at = coalesce(closed_at, now()) WHERE id = p_id;
    ELSIF p_context = 'ir_activation' THEN
        UPDATE ir_activations SET status = 'overridden', lm_override = v_override,
               override_reason = p_reason, closed_at = coalesce(closed_at, now()) WHERE id = p_id;
    ELSE
        RAISE EXCEPTION 'Unknown vote type %', p_context;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vote not found'; END IF;
    UPDATE polls SET closed_by = 'lm', closes_at = coalesce(closes_at, now())
    WHERE context_id = p_id AND closed_by IS NULL;
    INSERT INTO lm_actions (type, target, reason) VALUES ('vote_override', p_context || ':' || p_id, v_override || ': ' || p_reason);
    PERFORM post_note(format('LM override (%s): %s', CASE WHEN p_approve THEN 'approved' ELSE 'denied' END, p_reason),
                      ARRAY['lm_override', p_context]);
END $$;

-- ---------------------------------------------------------------
-- Action request queue
-- ---------------------------------------------------------------
CREATE FUNCTION submit_action(p_team uuid, p_type text, p_payload jsonb) RETURNS uuid LANGUAGE sql AS $$
    INSERT INTO action_requests (team_id, action_type, payload) VALUES (p_team, p_type, p_payload) RETURNING id;
$$;

-- LM marks a request executed (logs a transaction) or rejected (reason required).
CREATE FUNCTION process_action(p_request uuid, p_executed boolean, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    r action_requests%ROWTYPE;
    v_txn uuid;
BEGIN
    SELECT * INTO r FROM action_requests WHERE id = p_request FOR UPDATE;
    IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
    IF r.status <> 'pending' THEN RAISE EXCEPTION 'Request already %', r.status; END IF;

    IF p_executed THEN
        INSERT INTO transactions (type, team_id, player_id, details, lm_action, source)
        VALUES (CASE r.action_type WHEN 'add_player' THEN 'add' WHEN 'drop_player' THEN 'drop'
                                   WHEN 'waiver_claim' THEN 'waiver' WHEN 'ir_move' THEN 'IR'
                                   ELSE 'lineup' END,
                r.team_id,
                (SELECT player_id FROM players WHERE player_id = r.payload->>'player_id'),
                jsonb_build_object('action_request_id', r.id, 'payload', r.payload),
                true, 'lm_on_behalf')
        RETURNING txn_id INTO v_txn;
        UPDATE action_requests SET status = 'executed', processed_at = now(),
               lm_viewed_at = coalesce(lm_viewed_at, now()), lm_notes = p_notes,
               resulting_transaction_id = v_txn
        WHERE id = p_request;
    ELSE
        IF coalesce(trim(p_notes), '') = '' THEN RAISE EXCEPTION 'Give a reason for rejecting'; END IF;
        UPDATE action_requests SET status = 'rejected', processed_at = now(),
               lm_viewed_at = coalesce(lm_viewed_at, now()), lm_notes = p_notes
        WHERE id = p_request;
    END IF;
END $$;

-- Optional heads-up at submit time (non-blocking): would this add break caps?
CREATE FUNCTION would_exceed_caps(p_team uuid, p_player text) RETURNS boolean LANGUAGE sql STABLE AS $$
    WITH after AS (
        SELECT tier FROM roster_tiers WHERE team_id = p_team AND counts_toward_cap AND player_id <> p_player
        UNION ALL
        SELECT coalesce((SELECT tier FROM current_tiers WHERE player_id = p_player), 'T3')
    )
    SELECT count(*) FILTER (WHERE tier = 'T1') > 3 OR count(*) FILTER (WHERE tier = 'T2') > 3 FROM after;
$$;

COMMIT;
