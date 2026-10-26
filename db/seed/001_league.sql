-- 001_league.sql
-- Seed values from the Beer League Charter (Doc 1) and the v1.1 handoff.
-- Anything still waiting on a poll is marked source = 'placeholder'.
-- Safe to re-run: existing keys are updated in place.

BEGIN;

INSERT INTO league_settings (setting_key, setting_value, source) VALUES
    ('league_name',          'Beer League Basketball',  'charter'),
    ('platform',             'ESPN Fantasy Basketball', 'charter'),
    ('season',               '2026-27',                 'charter'),
    ('scoring_type',         'cumulative_total_points', 'charter'),
    -- Roster: 10 spots in all, no bench (LM, 2026-10-23; the charter had 13)
    ('roster_size',          '10',                      'lm_decision'),
    ('starter_slots',        'PG,SG,SF,PF,C,UTIL,UTIL,UTIL', 'lm_decision'),
    ('bench_slots',          '0',                       'lm_decision'),
    ('ir_slots',             '2',                       'lm_decision'),
    ('center_max',           '4',                       'charter'),
    ('lineup_lock',          'daily_first_game',        'charter'),
    ('draft_type',           'salary_cap',              'charter'),
    ('draft_budget',         '500',                     'charter'),
    ('keepers',              'off',                     'charter'),
    ('games_played_limit',   'none',                    'charter'),
    ('waiver_period_days',   '2',                       'charter'),
    ('waiver_order',         'inverse_standings_weekly_reset', 'charter'),
    ('trade_review',         'none',                    'charter'),
    ('tier1_max_rank',       '25',                      'charter'),
    ('tier2_max_rank',       '50',                      'charter'),
    ('tier1_cap',            '3',                       'charter'),
    ('tier2_cap',            '3',                       'charter'),
    ('tier_refresh_weeks',   '4',                       'charter'),
    ('bonus_stacking',       'highest_only',            'charter'),
    -- League polls (all closed, Jason 2026-10-25)
    ('scoring_model',        'hustle',                  'league_poll'),   -- Q13
    ('trade_deadline',       '2027-03-22',              'league_poll'),   -- Q7-9
    ('acquisition_limit',    'none',                    'league_poll'),   -- Q10
    ('tiebreaker',           'none',                    'league_poll'),   -- Q11
    ('playoff_format',       'none',                    'league_poll'),   -- Q12
    ('draft_datetime',       '2026-10-25 18:00 CT',     'league_poll'),   -- Q2-5
    -- Roster over caps straight out of the draft = legal overage (LM, 2026-10-23)
    ('draft_overage_badge',  'Power Play',              'lm_decision')
ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value, source = EXCLUDED.source;

-- Scoring models (Doc 3). Stat keys match scoring_ledger.stat_line.
-- tpmi = three-pointers missed; team_win = 1 when the player's NBA team won.
DELETE FROM scoring_models;
INSERT INTO scoring_models (model_key, stat, points) VALUES
    -- Model A: Hustle
    ('hustle', 'pts', 2),   ('hustle', 'fgm', 4),   ('hustle', 'fga', -2),
    ('hustle', 'ftm', 2),   ('hustle', 'fta', -1),  ('hustle', 'tpm', 2),
    ('hustle', 'tpmi', -1), ('hustle', 'oreb', 1),  ('hustle', 'dreb', 2),
    ('hustle', 'ast', 4),   ('hustle', 'stl', 7),   ('hustle', 'blk', 9),
    ('hustle', 'tov', -4),  ('hustle', 'pf', -1),   ('hustle', 'ff', -3),
    ('hustle', 'tf', -2),   ('hustle', 'ej', -5),   ('hustle', 'dd', 5),
    ('hustle', 'td', 8),    ('hustle', 'qd', 20),   ('hustle', 'team_win', 5),
    -- Model B: ESPN Default
    ('espn_default', 'pts', 1),  ('espn_default', 'fgm', 2),  ('espn_default', 'fga', -1),
    ('espn_default', 'ftm', 1),  ('espn_default', 'fta', -1), ('espn_default', 'tpm', 1),
    ('espn_default', 'reb', 1),  ('espn_default', 'ast', 2),  ('espn_default', 'stl', 4),
    ('espn_default', 'blk', 4),  ('espn_default', 'tov', -2),
    -- Model C: Balanced
    ('balanced', 'pts', 1.5),  ('balanced', 'fgm', 3),    ('balanced', 'fga', -1.5),
    ('balanced', 'ftm', 1.5),  ('balanced', 'fta', -1),   ('balanced', 'tpm', 1.5),
    ('balanced', 'tpmi', -0.5),('balanced', 'reb', 1.5),  ('balanced', 'ast', 3),
    ('balanced', 'stl', 5),    ('balanced', 'blk', 6),    ('balanced', 'tov', -3),
    ('balanced', 'pf', -0.5),  ('balanced', 'dd', 3),     ('balanced', 'td', 5);

-- Teams: the 7 in ESPN's order (ESPN team 1-7). Abbreviations match ESPN so espn_sync.py teams links them.
-- GMs by first name only (the site shows no surnames).
-- On a database built from scratch the migrations run first, so 013/015 may already have made BBT.
INSERT INTO teams (team_name, abv, gm_name, manager_assigned) VALUES
    ('The Cooper Flaggs!',              'FLAG', 'Kenneth',     true),
    ('The Lebroniacs',                  'LBA',  'Michael',     true),
    ('Statistically Speaking',          'STAT', 'Laura',       true),
    ('Bucket Squad',                    'JME',  'Jacob',       true),
    ('Marine Poop Squad',               'MPS',  'Sierra',      true),
    ('Christopher''s Competitive Team', 'CCT',  'Christopher', true),
    ('Bozo''s Best Team',               'BBT',  'Bozo',        true)
ON CONFLICT (abv) DO NOTHING;

INSERT INTO standings (team_id, total_points)
SELECT team_id, 0 FROM teams
ON CONFLICT (team_id) DO NOTHING;

COMMIT;
