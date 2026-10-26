-- Roster slots chosen by the LM on 2026-10-23: 10 spots in all, no bench.
-- PG, SG, SF, PF, C and 3 UTIL start; 2 IR spots count toward the 10.
BEGIN;
UPDATE league_settings SET setting_value = v.value, source = 'lm_decision'
FROM (VALUES ('roster_size', '10'), ('starter_slots', 'PG,SG,SF,PF,C,UTIL,UTIL,UTIL'),
             ('bench_slots', '0'), ('ir_slots', '2')) AS v(key, value)
WHERE setting_key = v.key;
COMMIT;
