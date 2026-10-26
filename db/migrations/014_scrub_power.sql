-- 014_scrub_power.sql
-- Scrub of the Week, new rule (Jason, 2026-10-24): the poll lists free agents (on no fantasy
-- roster) who are 🚶 Tier 3 right now but made the top 20 of the commissioner's power ranking
-- (league_settings.tier_ranking) in at least one run over the last 30 days.
BEGIN;

-- A player name with accents, punctuation and Jr./III dropped, so NBA.com's "Luka Dončić" in
-- the power rankings meets ESPN's "Luka Doncic". Same rule as the site's normName() and
-- sync/power_tiers.py norm().
CREATE FUNCTION norm_name(n text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT btrim(regexp_replace(regexp_replace(regexp_replace(
        translate(lower(n), 'áàâäãåāăąćčçďđéèêëēėęěğģíìîïīįıķĺļľłńňņñóòôöõøōőŕřśšşșťţțúùûüūůűųýÿźżž',
                            'aaaaaaaaacccddeeeeeeeeggiiiiiiikllllnnnnoooooooorrsssstttuuuuuuuuyyzzz'),
        '[^a-z0-9 ]', '', 'g'), '\m(jr|sr|ii|iii|iv)\M', '', 'g'), '\s+', ' ', 'g'))
$$;

DROP VIEW scrub_candidates;
CREATE VIEW scrub_candidates AS
WITH hot AS (            -- every top-20 finish in the tier ranking over the last 30 days
    SELECT pr.rank, pr.run_date, pr.player_name, pr.nba_person_id
    FROM power_rankings pr
    WHERE pr.ranking = coalesce((SELECT nullif(setting_value, 'tbd') FROM league_settings
                                 WHERE setting_key = 'tier_ranking'), 'weekly_nba')
      AND pr.rank <= 20
      AND pr.run_date > current_date - 30)
SELECT p.player_id, p.name AS player_name, p.nba_team,
       min(h.rank) AS best_rank, count(*) AS top20_runs, max(h.run_date) AS last_top20
FROM hot h
JOIN players p ON p.nba_person_id = h.nba_person_id
               OR (h.nba_person_id IS NULL AND norm_name(p.name) = norm_name(h.player_name))
JOIN current_tiers ct ON ct.player_id = p.player_id AND ct.tier = 'T3'
WHERE NOT EXISTS (SELECT 1 FROM rosters r WHERE r.player_id = p.player_id)
GROUP BY p.player_id, p.name, p.nba_team
ORDER BY best_rank, top20_runs DESC, player_name;

CREATE OR REPLACE FUNCTION create_scrub_poll() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    v_options text[];
    v_poll uuid;
BEGIN
    SELECT array_agg(format('%s (%s) · best #%s', player_name, coalesce(nba_team, 'FA'), best_rank))
    INTO v_options
    FROM (SELECT * FROM scrub_candidates LIMIT 10) top10;
    IF coalesce(array_length(v_options, 1), 0) < 2 THEN
        RAISE EXCEPTION 'Not enough Scrub candidates yet: it needs 2+ free agents in Tier 3 who made the power ranking top 20 in the last 30 days';
    END IF;
    v_poll := create_poll(format('Scrub of the Week (%s)', to_char(current_date, 'Mon DD')),
                          'single_choice', v_options,
                          'Free agents in 🚶 Tier 3 who cracked the top 20 of the power ranking in the last 30 days. Pick your favorite.',
                          NULL, 'scrub_nominee');
    PERFORM post_note('Scrub of the Week voting is open.', ARRAY['scrub_of_the_week', 'vote_open']);
    RETURN v_poll;
END $$;

COMMIT;
