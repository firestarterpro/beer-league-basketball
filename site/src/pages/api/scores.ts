// GET [?team=<team_id>] -> today's NBA games for the live scores ticker (NBA's Eastern game date, plus
// anything still live past midnight). mine = one of that fantasy team's players is in the game.
import type { APIRoute } from "astro";
import { query } from "../../lib/db";
import { handle } from "../../lib/http";

export const GET: APIRoute = ({ url }) =>
  handle(async () => {
    const team = url.searchParams.get("team") ?? "";
    const teamId = /^[0-9a-f-]{36}$/i.test(team) ? team : null;
    return query(
      `WITH mine AS (
         SELECT DISTINCT nba_tricode(p.nba_team) AS tri
         FROM rosters r JOIN players p USING (player_id)
         WHERE r.team_id = $1::uuid AND p.nba_team IS NOT NULL
       )
       SELECT g.game_id, g.away_team, g.home_team, g.away_score, g.home_score, g.status::int AS status, g.status_text,
              to_char(g.tip_utc AT TIME ZONE 'America/Chicago', 'FMHH12:MI am') AS tip,
              EXISTS (SELECT 1 FROM mine WHERE tri IN (g.home_team, g.away_team)) AS mine
       FROM games g
       WHERE NOT g.postponed
         AND (g.game_date = (now() AT TIME ZONE 'America/New_York')::date OR g.status = 2)
       ORDER BY g.status = 3, g.tip_utc NULLS LAST, g.game_id`,
      [teamId]);
  });
