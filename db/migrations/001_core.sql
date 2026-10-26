-- 001_core.sql
-- Core league tables from Doc 7 (League Data Model & Schema Specification),
-- with the v1.1 handoff changes applied.
-- Logs are append-only. Every row has created_at; mutable rows have updated_at.

BEGIN;

-- ---------------------------------------------------------------
-- League configuration (key-value, versioned by effective_date)
-- ---------------------------------------------------------------
CREATE TABLE league_settings (
    setting_key     text PRIMARY KEY,
    setting_value   text,                       -- stored as string, typed on read
    effective_date  date NOT NULL DEFAULT current_date,
    source          text,                       -- 'charter', 'poll:Q13', 'placeholder', ...
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Teams
-- active           = team exists in the league
-- manager_assigned = team has a real GM (drives vote threshold math)
-- uses_web_actions = GM opted in to the action request queue
-- ---------------------------------------------------------------
CREATE TABLE teams (
    team_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    espn_team_id      integer UNIQUE,           -- ESPN's numeric team id, filled by sync
    team_name         text NOT NULL,
    abv               text UNIQUE,              -- 3-letter code
    gm_name           text,
    join_date         date DEFAULT current_date,
    active            boolean NOT NULL DEFAULT true,
    manager_assigned  boolean NOT NULL DEFAULT false,
    uses_web_actions  boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- NBA player master. player_id = ESPN player id (as text).
-- nba_person_id links to stats.nba.com for power rankings.
-- ---------------------------------------------------------------
CREATE TABLE players (
    player_id      text PRIMARY KEY,
    nba_person_id  integer UNIQUE,
    name           text NOT NULL,
    nba_team       text,
    positions      text[] NOT NULL DEFAULT '{}',
    status         text,                        -- active / out / IR-eligible / day-to-day ...
    injury_note    text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Tiers: versioned snapshots every 4 weeks
-- ---------------------------------------------------------------
CREATE TABLE tier_snapshots (
    snapshot_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version         integer NOT NULL UNIQUE,
    effective_date  date NOT NULL,
    published_at    timestamptz NOT NULL DEFAULT now(),
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tier_assignments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id  uuid NOT NULL REFERENCES tier_snapshots(snapshot_id),
    player_id    text NOT NULL REFERENCES players(player_id),
    rank         integer NOT NULL CHECK (rank > 0),
    -- T1 = rank 1-25, T2 = 26-50, T3 = 51+ (Charter §7). Derived so it can't drift.
    tier         text GENERATED ALWAYS AS (
                     CASE WHEN rank <= 25 THEN 'T1'
                          WHEN rank <= 50 THEN 'T2'
                          ELSE 'T3' END) STORED,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (snapshot_id, player_id)
);

-- ---------------------------------------------------------------
-- Current roster state (synced from ESPN, replaced each sync)
-- slot: active / bench / IR
-- ---------------------------------------------------------------
CREATE TABLE rosters (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id        uuid NOT NULL REFERENCES teams(team_id),
    player_id      text NOT NULL REFERENCES players(player_id),
    slot           text NOT NULL DEFAULT 'bench' CHECK (slot IN ('active', 'bench', 'IR')),
    position_slot  text,                        -- PG/SG/SF/PF/C
    acquired_date  date,
    acquired_via   text CHECK (acquired_via IN ('draft', 'waiver', 'free_agent', 'trade')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (player_id)                          -- a player is on at most one roster
);

-- ---------------------------------------------------------------
-- Draft prices ($500 draft-only budget; Doc 7 called this "salaries")
-- ---------------------------------------------------------------
CREATE TABLE draft_prices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id         uuid NOT NULL REFERENCES teams(team_id),
    player_id       text NOT NULL REFERENCES players(player_id),
    price           numeric NOT NULL CHECK (price >= 0),
    effective_date  date NOT NULL DEFAULT current_date,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Append-only transaction log
-- source: espn_sync / lm_on_behalf / lm_manual
-- ---------------------------------------------------------------
CREATE TABLE transactions (
    txn_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    espn_txn_id   text UNIQUE,                  -- dedupe key for ESPN sync
    type          text NOT NULL CHECK (type IN ('add', 'drop', 'trade', 'waiver', 'IR', 'lineup')),
    team_id       uuid REFERENCES teams(team_id),
    player_id     text REFERENCES players(player_id),
    "timestamp"   timestamptz NOT NULL DEFAULT now(),
    details       jsonb NOT NULL DEFAULT '{}',
    lm_action     boolean NOT NULL DEFAULT false,
    source        text NOT NULL DEFAULT 'espn_sync'
                  CHECK (source IN ('espn_sync', 'lm_on_behalf', 'lm_manual')),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_team_time ON transactions (team_id, "timestamp" DESC);

CREATE TABLE waivers (
    claim_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id    text NOT NULL REFERENCES players(player_id),
    team_id      uuid NOT NULL REFERENCES teams(team_id),
    claim_time   timestamptz NOT NULL DEFAULT now(),
    priority     integer,
    resolves_at  timestamptz,
    status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost')),
    resolved_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Trades are display-only (they stay in ESPN chat); filled by ESPN sync.
CREATE TABLE trades (
    trade_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    espn_trade_id text UNIQUE,
    from_team     uuid NOT NULL REFERENCES teams(team_id),
    to_team       uuid NOT NULL REFERENCES teams(team_id),
    players_out   text[] NOT NULL DEFAULT '{}',
    players_in    text[] NOT NULL DEFAULT '{}',
    status        text NOT NULL DEFAULT 'processed' CHECK (status IN ('proposed', 'accepted', 'processed')),
    proposed_at   timestamptz,
    processed_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lineups (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id        uuid NOT NULL REFERENCES teams(team_id),
    game_date      date NOT NULL,
    position_slot  text NOT NULL,
    player_id      text NOT NULL REFERENCES players(player_id),
    submitted_at   timestamptz NOT NULL DEFAULT now(),
    locked         boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (team_id, game_date, player_id)
);

-- ---------------------------------------------------------------
-- Scoring
-- scoring_models: the three models from Doc 3, as editable rows.
-- scoring_ledger: one row per player-game. stat_line holds the raw
--   box score; fantasy_points is the ACTIVE model at write time.
--   The other two models are computed from stat_line in a view (003).
-- ---------------------------------------------------------------
CREATE TABLE scoring_models (
    model_key   text NOT NULL,                  -- hustle / espn_default / balanced
    stat        text NOT NULL,                  -- key in stat_line, or dd/td/qd/team_win
    points      numeric NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (model_key, stat)
);

CREATE TABLE scoring_ledger (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id              text NOT NULL REFERENCES players(player_id),
    game_id                text NOT NULL,       -- ESPN or NBA game id
    game_date              date NOT NULL,
    -- keys: pts fgm fga ftm fta tpm tpa oreb dreb reb ast stl blk tov pf ff tf ej team_win min
    stat_line              jsonb NOT NULL,
    fantasy_points         numeric,
    scoring_model_version  text,
    created_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (player_id, game_id)
);
CREATE INDEX scoring_ledger_date ON scoring_ledger (game_date);

-- NBA.com hustle/defensive tracking per player-game (power rankings input).
CREATE TABLE nba_tracking_games (
    nba_person_id    integer NOT NULL,
    game_id          text NOT NULL,
    game_date        date NOT NULL,
    minutes          numeric,
    deflections      numeric,
    contested_shots  numeric,
    charges_drawn    numeric,
    box_outs         numeric,
    loose_balls      numeric,
    dfg_made         numeric,                   -- defended FG made
    dfg_attempted    numeric,                   -- defended FG attempted
    rim_dfg_made     numeric,
    rim_dfg_attempted numeric,
    created_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (nba_person_id, game_id)
);

-- NBA.com people seen in box scores, used to link nba_person_id onto players.
CREATE TABLE nba_people (
    nba_person_id  integer PRIMARY KEY,
    name           text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE standings (
    team_id       uuid PRIMARY KEY REFERENCES teams(team_id),
    total_points  numeric NOT NULL DEFAULT 0,
    rank          integer,
    last_updated  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE draft_board (
    pick_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id           uuid NOT NULL REFERENCES teams(team_id),
    player_id         text NOT NULL REFERENCES players(player_id),
    bid               numeric NOT NULL,
    budget_remaining  numeric,
    "timestamp"       timestamptz NOT NULL DEFAULT now(),
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Governance
-- ---------------------------------------------------------------
CREATE TABLE rulebook (
    rule_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section         text NOT NULL,
    text            text NOT NULL,
    effective_date  date NOT NULL DEFAULT current_date,
    version         integer NOT NULL DEFAULT 1,
    source_doc      text,                       -- e.g. 'Charter'
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Final outcome of a poll, written when the LM closes it.
CREATE TABLE poll_results (
    poll_id     uuid PRIMARY KEY,               -- same id as polls.id (002)
    question    text NOT NULL,
    options     jsonb,
    votes       jsonb,
    winner      text,
    closed_at   timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lm_actions (
    action_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type         text NOT NULL,                 -- tier_enforcement / settings_change / waiver_override / vote_override ...
    target       text,
    reason       text,
    "timestamp"  timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE compliance_checks (
    check_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     uuid NOT NULL REFERENCES teams(team_id),
    badge       text,
    violations  jsonb NOT NULL DEFAULT '[]',
    checked_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Append-only guard for log tables
-- ---------------------------------------------------------------
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

CREATE TRIGGER transactions_append_only BEFORE UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER lm_actions_append_only BEFORE UPDATE OR DELETE ON lm_actions
    FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- updated_at maintenance
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER league_settings_touch BEFORE UPDATE ON league_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER teams_touch           BEFORE UPDATE ON teams           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER players_touch         BEFORE UPDATE ON players         FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER rosters_touch         BEFORE UPDATE ON rosters         FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
