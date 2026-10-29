// GET ?team=<team_id>|all&days=3 -> Home "Upcoming games": each roster (photo, slot, injury, avg fantasy
// points under the league's model) plus which of those players have an NBA game on each of the next days.
import type { APIRoute } from "astro";
import { query } from "../../lib/db";
import { handle } from "../../lib/http";
import { leagueModel, photoSql, portraitSrc, headshotSrc, isHurt } from "../../lib/players";

export const GET: APIRoute = ({ url }) =>
  handle(async () => {
    const team = url.searchParams.get("team") ?? "";
    const days = Math.min(7, Math.max(1, Number(url.searchParams.get("days")) || 3));
    const all = team === "all";
    if (!all && !/^[0-9a-f-]{36}$/i.test(team)) return { roster: [], games: [] };
    const model = await leagueModel();
    const [roster, games] = await Promise.all([
      query(
        `SELECT r.team_id, t.team_name, lower(t.abv) AS abv, t.espn_team_id, p.player_id AS id, p.name, p.nba_team,
                p.nba_person_id AS nba_id, ${photoSql()} AS photo, r.slot, r.position_slot AS pos, p.status, p.injury_note,
                ps.avg_points::float AS avg
         FROM rosters r JOIN teams t ON t.team_id = r.team_id JOIN players p ON p.player_id = r.player_id
         LEFT JOIN player_season_points ps ON ps.player_id = p.player_id AND ps.model_key = $2
         WHERE t.active AND ($1 = 'all' OR r.team_id::text = $1)
         ORDER BY t.espn_team_id NULLS LAST, t.team_name`,
        [team, model]),
      query(
        `SELECT team_id, player_id AS id, game_date::text AS d, to_char(tip_central, 'FMHH12:MI am') AS tip, tip_central
         FROM report_team_schedule
         WHERE ($1 = 'all' OR team_id::text = $1) AND game_date < (now() AT TIME ZONE 'America/Chicago')::date + $2::int
         ORDER BY game_date, tip_central NULLS LAST`,
        [team, days]),
    ]);
    return {
      roster: roster.map((r) => ({
        ...r,
        img: r.photo ? portraitSrc(r.nba_id) ?? headshotSrc(r.nba_id) : null,
        hurt: isHurt(r.status),
      })),
      games: games.map(({ team_id, id, d, tip }) => ({ team_id, id, d, tip })),
    };
  });
