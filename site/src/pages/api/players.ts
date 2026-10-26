// GET ?q=name -> up to 20 matching players with their current tier.
import type { APIRoute } from "astro";
import { query } from "../../lib/db";
import { handle } from "../../lib/http";

export const GET: APIRoute = ({ url }) =>
  handle(() =>
    query(
      `SELECT p.player_id, p.name, p.nba_team, coalesce(ct.tier, 'T3') AS tier, ct.rank,
              t.team_name AS fantasy_team
       FROM players p
       LEFT JOIN current_tiers ct USING (player_id)
       LEFT JOIN rosters r USING (player_id)
       LEFT JOIN teams t ON t.team_id = r.team_id
       WHERE p.name ILIKE '%' || $1 || '%'
       ORDER BY ct.rank NULLS LAST, p.name
       LIMIT 20`, [url.searchParams.get("q") ?? ""]));
