-- Tiers show as emoji instead of T1/T2/T3 (LM, 2026-10-23): T1 🤾, T2 ⛹️, T3 🚶.
-- The tier column itself stays T1/T2/T3; only the text people read changes.
BEGIN;

CREATE FUNCTION tier_emoji(p_tier text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_tier WHEN 'T1' THEN '🤾' WHEN 'T2' THEN '⛹️' ELSE '🚶' END
$$;

-- Vote questions and feed notes for restricted adds now read "Approve X adding Y (🤾)?".
CREATE OR REPLACE FUNCTION create_claim(p_team uuid, p_player text) RETURNS uuid LANGUAGE plpgsql AS $$
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
    SELECT tier_emoji(coalesce((SELECT tier FROM current_tiers WHERE player_id = p_player), 'T3')) INTO v_tier;

    INSERT INTO restricted_fa_claims (team_id, player_id) VALUES (p_team, p_player) RETURNING id INTO v_claim;
    v_poll := yes_no_vote(format('Approve %s adding %s (%s)?', v_team, v_player, v_tier),
                          'claim_approval', v_claim, p_team,
                          'This add would put the team over its tier caps. Majority of managers approves.');
    UPDATE restricted_fa_claims SET poll_id = v_poll WHERE id = v_claim;
    PERFORM post_note(format('%s requested %s (%s). Vote is open.', v_team, v_player, v_tier),
                      ARRAY['restricted_fa', 'vote_open']);
    RETURN v_claim;
END $$;

COMMIT;
