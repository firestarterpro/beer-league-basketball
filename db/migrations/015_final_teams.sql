-- 015_final_teams.sql
-- The last 3 teams (Jason, 2026-10-24), in the slots ESPN shows: Team 5 -> SRL Sierra Leone
-- (ESPN 5; still "TM5" on ESPN until he updates it), Team 6 -> CCT Christopher's Competitive Team
-- (ESPN 6), Team 7 -> BBT Bozo's Best Team (ESPN 7). Same team_id, so pets, standings and
-- history carry over. "Has a GM" for SRL stays off until it's set up; the LM can tick it on /lm.
BEGIN;

UPDATE teams SET team_name = 'Sierra Leone', abv = 'SRL', espn_team_id = 5
WHERE abv = 'TM5';

UPDATE teams SET team_name = 'Christopher''s Competitive Team', abv = 'CCT', gm_name = 'Christopher',
       manager_assigned = true, espn_team_id = 6
WHERE abv = 'TM6';

UPDATE teams SET team_name = 'Bozo''s Best Team', abv = 'BBT', gm_name = 'Bozo Clown',
       manager_assigned = true, espn_team_id = 7
WHERE abv = 'TM7';

COMMIT;
