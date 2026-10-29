// Action request queue (opt-in teams only).
// GET ?team=...                     -> the team's opt-in flag, roster and recent requests
// POST { team_id, action_type, payload } -> submit a request
import type { APIRoute } from "astro";
import { one, query } from "../../lib/db";
import { body, handle } from "../../lib/http";

export const GET: APIRoute = ({ url }) =>
  handle(async () => {
    const team = url.searchParams.get("team");
    const [info, roster, requests] = await Promise.all([
      one("SELECT team_name, uses_web_actions FROM teams WHERE team_id = $1", [team]),
      query(`SELECT player_id, player_name, tier, rank, slot, position_slot, nba_team FROM roster_tiers WHERE team_id = $1
             ORDER BY slot, tier, player_name`, [team]),
      query(`SELECT r.id, r.action_type, r.payload, r.status, r.submitted_at, r.processed_at, r.lm_notes,
                    (SELECT name FROM players WHERE player_id = r.payload->>'player_id') AS player_name
             FROM action_requests r WHERE r.team_id = $1 ORDER BY r.submitted_at DESC LIMIT 30`, [team]),
    ]);
    return { info, roster, requests };
  });

export const POST: APIRoute = ({ request }) =>
  handle(async () => {
    const b = await body(request);
    return one("SELECT submit_action($1, $2, $3::jsonb) AS id", [b.team_id, b.action_type, JSON.stringify(b.payload ?? {})]);
  });
