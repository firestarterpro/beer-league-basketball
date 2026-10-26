-- 002_voting_and_queue.sql
-- Polls, restricted-FA claims, IR activations, action request queue, notes.
-- One voting primitive (polls) reused by claims and IR activations via
-- context_type + context_id. No auth: votes are voluntary and informal.

BEGIN;

CREATE TABLE polls (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question      text NOT NULL,
    description   text,
    type          text NOT NULL
                  CHECK (type IN ('single_choice', 'multi_select', 'rating', 'ranked', 'text')),
    context_type  text NOT NULL DEFAULT 'generic'
                  CHECK (context_type IN ('generic', 'claim_approval', 'ir_activation', 'scrub_nominee')),
    context_id    uuid,                         -- restricted_fa_claims.id or ir_activations.id (not a hard FK: points at two tables)
    opens_at      timestamptz NOT NULL DEFAULT now(),
    closes_at     timestamptz,                  -- NULL = LM closes manually
    closed_by     text,                         -- 'lm' or NULL
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE poll_options (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id        uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    label          text NOT NULL,
    display_order  integer NOT NULL DEFAULT 0
);

-- response_json shape per poll type:
--   single_choice  {"option_id": "<uuid>"}
--   multi_select   {"option_ids": ["<uuid>", ...]}
--   rating         {"rating": 1..5}            (one rating for the whole poll)
--   ranked         {"ranking": ["<uuid>", ...]} (first = rank 1)
--   text           {"text": "..."}
CREATE TABLE poll_responses (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id        uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    team_id        uuid NOT NULL REFERENCES teams(team_id),
    response_json  jsonb NOT NULL,
    is_auto_yes    boolean NOT NULL DEFAULT false,  -- requesting GM on claims / IR activations
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz,
    UNIQUE (poll_id, team_id)                   -- one ballot per team per poll; edits update it
);

-- Shared status vocabulary for claims and IR activations.
-- lm_override: approved_override | denied_override | NULL
CREATE TABLE restricted_fa_claims (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id          uuid NOT NULL REFERENCES teams(team_id),
    player_id        text NOT NULL REFERENCES players(player_id),
    poll_id          uuid REFERENCES polls(id),
    status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'failed', 'overridden')),
    lm_override      text CHECK (lm_override IN ('approved_override', 'denied_override')),
    override_reason  text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    closed_at        timestamptz,
    CHECK ((status = 'overridden') = (lm_override IS NOT NULL))
);

CREATE TABLE ir_activations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id             uuid NOT NULL REFERENCES teams(team_id),
    player_id           text NOT NULL REFERENCES players(player_id),
    from_slot           text NOT NULL DEFAULT 'IR',
    to_slot             text NOT NULL,
    resulting_t1_count  integer,
    resulting_t2_count  integer,
    is_compliant        boolean NOT NULL,
    poll_id             uuid REFERENCES polls(id),   -- social confirmation poll or formal vote
    status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'failed', 'overridden')),
    lm_override         text CHECK (lm_override IN ('approved_override', 'denied_override')),
    override_reason     text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    closed_at           timestamptz,
    CHECK ((status = 'overridden') = (lm_override IS NOT NULL))
);

-- Opt-in queue: GMs submit ESPN actions, LM executes them. No trades.
CREATE TABLE action_requests (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id                   uuid NOT NULL REFERENCES teams(team_id),
    action_type               text NOT NULL
                              CHECK (action_type IN ('lineup_change', 'add_player', 'drop_player', 'waiver_claim', 'ir_move')),
    payload                   jsonb NOT NULL,
    status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'executed', 'rejected')),
    submitted_at              timestamptz NOT NULL DEFAULT now(),
    lm_viewed_at              timestamptz,
    processed_at              timestamptz,
    lm_notes                  text,
    resulting_transaction_id  uuid REFERENCES transactions(txn_id),
    CHECK (status <> 'rejected' OR coalesce(lm_notes, '') <> '')   -- rejections need a reason
);
CREATE INDEX action_requests_pending ON action_requests (submitted_at) WHERE status = 'pending';

-- Only GMs who opted in can submit to the queue.
CREATE FUNCTION check_web_actions_opt_in() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT (SELECT uses_web_actions FROM teams WHERE team_id = NEW.team_id) THEN
        RAISE EXCEPTION 'Web requests are off for this team. Make the move in ESPN, or ask the LM to turn them on.';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER action_requests_opt_in BEFORE INSERT ON action_requests
    FOR EACH ROW EXECUTE FUNCTION check_web_actions_opt_in();

-- Notes feed: LM announcements + auto-generated system entries.
CREATE TABLE notes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    author_team_id  uuid REFERENCES teams(team_id),  -- NULL = LM or system
    body            text NOT NULL,
    tags            text[] NOT NULL DEFAULT '{}',
    visible         boolean NOT NULL DEFAULT true
);
CREATE INDEX notes_recent ON notes (created_at DESC) WHERE visible;

COMMIT;
