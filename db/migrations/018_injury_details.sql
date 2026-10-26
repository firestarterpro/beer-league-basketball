-- 018_injury_details.sql
-- What's hurt and when he's expected back, from ESPN's NBA injury report (`espn_sync.py injuries`).
-- The fantasy player pool only says ACTIVE / DAY_TO_DAY / OUT; the injury report adds the body part
-- ('Foot', 'Knee', 'Illness'), side, the kind of injury ('Fracture', 'Sprain') and ESPN's estimated
-- return date. players.injury_note keeps a one-line summary ('Left foot fracture').
BEGIN;
ALTER TABLE players
    ADD COLUMN injury_body_part   text,
    ADD COLUMN injury_side        text,
    ADD COLUMN injury_detail      text,
    ADD COLUMN injury_return_date date,
    ADD COLUMN injury_updated_at  timestamptz;
COMMIT;
