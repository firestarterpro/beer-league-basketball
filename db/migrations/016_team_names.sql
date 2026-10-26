-- 016_team_names.sql
-- Jason, 2026-10-24: JST becomes JME "Bucket Squad", matching ESPN team 4. Same team_id, so pets,
-- votes, standings and history carry over; the site keeps the JST card art until new art arrives.
-- SRL's GM shows as "Team 5" until a real GM joins ("Has a GM" stays off; the LM can change both on /lm).
BEGIN;

UPDATE teams SET abv = 'JME', team_name = 'Bucket Squad'
WHERE abv = 'JST';

UPDATE teams SET gm_name = 'Team 5'
WHERE abv = 'SRL' AND coalesce(gm_name, '') = '';

COMMIT;
