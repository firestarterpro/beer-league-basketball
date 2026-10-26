// GET ?team=<team_id>&days=3 -> that team's rostered players' NBA games, soonest first,
// each with the player's rank in the latest heat rankings.
import type { APIRoute } from "astro";
import { query } from "../../lib/db";
import { handle } from "../../lib/http";

export const GET: APIRoute = ({ url }) =>
  handle(async () => {
    const team = url.searchParams.get("team") ?? "";
    const days = Math.min(14, Math.max(1, Number(url.searchParams.get("days")) || 3));
    if (!/^[0-9a-f-]{36}$/i.test(team)) return [];
    return query(
      `SELECT s.game_date::text AS game_date, to_char(s.tip_central, 'FMHH12:MI am') AS tip, s.player_name, s.nba_team,
              s.slot, s.position_slot, s.opponent, s.status,
              max(h.rank) FILTER (WHERE h.ranking = 'weekly_fantasy')  AS weekly_fantasy,
              max(h.rank) FILTER (WHERE h.ranking = 'minutes_fantasy') AS minutes_fantasy,
              max(h.rank) FILTER (WHERE h.ranking = 'weekly_nba')      AS weekly_nba,
              max(h.rank) FILTER (WHERE h.ranking = 'minutes_nba')     AS minutes_nba
       FROM report_team_schedule s
       LEFT JOIN latest_heat_ranks h
         ON h.nba_person_id = s.nba_person_id OR (h.nba_person_id IS NULL AND lower(h.player_name) = lower(s.player_name))
       WHERE s.team_id = $1 AND s.game_date < (now() AT TIME ZONE 'America/Chicago')::date + $2::int
       GROUP BY s.game_date, s.tip_central, s.player_name, s.nba_team, s.slot, s.position_slot, s.opponent, s.status
       ORDER BY s.game_date, s.tip_central NULLS LAST, s.slot, s.player_name`,
      [team, days]);
  });
