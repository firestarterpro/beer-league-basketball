-- 011_pets.sql
-- Giga Prospect pets. Each device plays and autosaves its own copy; this is the
-- league copy (one per team) that devices push to and pull from. The newest real
-- change (state->>'actedAt') wins. No auth: it's a family league toy.
BEGIN;

CREATE TABLE pets (
    team_id      uuid PRIMARY KEY REFERENCES teams(team_id) ON DELETE CASCADE,
    state        jsonb NOT NULL,              -- the whole pet as the device saved it
    power        numeric NOT NULL DEFAULT 0,  -- copied out of state for Looker / the wall
    fire_until   timestamptz,                 -- 🔥 Flame On until
    super_until  timestamptz,                 -- 🌟 timed Super Saiyan until
    acted_at     timestamptz NOT NULL,        -- last real change on the device that pushed
    push_kind    text CHECK (push_kind IN ('auto', 'sync', 'manual')),
    pushed_by    text,                        -- device id (bl.deviceId), for curiosity only
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Commissioner gifts. team_id NULL = everyone. fx uses the same keys as prizes:
-- tokens, power, hunger, happy, energy, fireHours, superHours, spins.
CREATE TABLE pet_gifts (
    id          serial PRIMARY KEY,
    title       text NOT NULL,
    team_id     uuid REFERENCES teams(team_id) ON DELETE CASCADE,
    fx          jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL DEFAULT now() + interval '14 days'
);

-- Live tuning from the Pet desk. Overrides public/pet/config.js (same keys).
CREATE TABLE pet_settings (
    id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    overrides   jsonb NOT NULL DEFAULT '{}',
    updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO pet_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

COMMIT;
