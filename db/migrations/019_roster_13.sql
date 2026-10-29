-- Roster (Jason, 2026-10-28): 2 PG, 2 SG, 2 SF, 2 PF, 2 C start, 3 UTIL/bench, plus 2 IR
-- (13 spots, up to 15 with 2 on IR). Replaces 008's 10 spots with no bench.
-- Tier caps are only noted from 2026-10-29: the site no longer opens cap votes or shows Violation
-- badges. The old cap functions and views stay in the database, unused, so nothing else breaks.
BEGIN;
UPDATE league_settings SET setting_value = v.value, source = 'lm_decision'
FROM (VALUES ('roster_size', '13'), ('starter_slots', 'PG,PG,SG,SG,SF,SF,PF,PF,C,C'),
             ('bench_slots', '3'), ('ir_slots', '2')) AS v(key, value)
WHERE setting_key = v.key;
COMMIT;
