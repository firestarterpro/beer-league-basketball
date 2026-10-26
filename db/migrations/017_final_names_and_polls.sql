-- 017_final_names_and_polls.sql
-- Jason, 2026-10-25 (Ideal Concocter): the final team list and the closed league polls.
-- * Team 5 becomes MPS "Marine Poop Squad" (was SRL Sierra Leone), GM Sierra. Same team_id, so the pet,
--   standings and history carry over. ESPN team 5 stays linked by espn_team_id.
-- * The site shows managers' FIRST names only.
-- * Poll answers: Hustle scoring, trade deadline March 22 2027, no acquisition limit, no tiebreaker,
--   season-long points only (no playoffs). The draft was 2026-10-25 at 6pm Central.
BEGIN;

UPDATE teams SET abv = 'MPS', team_name = 'Marine Poop Squad', gm_name = 'Sierra', manager_assigned = true
WHERE abv = 'SRL';

UPDATE teams SET gm_name = v.first
FROM (VALUES ('FLAG', 'Kenneth'), ('LBA', 'Michael'), ('STAT', 'Laura'), ('JME', 'Jacob'),
             ('CCT', 'Christopher'), ('BBT', 'Bozo')) v(abv, first)
WHERE teams.abv = v.abv;

INSERT INTO league_settings (setting_key, setting_value, source) VALUES
    ('scoring_model',     'hustle',              'league_poll'),   -- Q13
    ('trade_deadline',    '2027-03-22',          'league_poll'),   -- Q7-9
    ('acquisition_limit', 'none',                'league_poll'),   -- Q10
    ('tiebreaker',        'none',                'league_poll'),   -- Q11 (n/a)
    ('playoff_format',    'none',                'league_poll'),   -- Q12: season-long points only
    ('draft_datetime',    '2026-10-25 18:00 CT', 'league_poll')    -- Q2-5
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, source = EXCLUDED.source;

COMMIT;
