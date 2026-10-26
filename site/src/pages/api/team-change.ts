// Voting-team lock changes, handled through the notes feed.
// POST { device, from, to } -> GM asks the LM to switch their voting team.
// GET ?device=...           -> the team the LM approved for this device, if any.
import type { APIRoute } from "astro";
import { one } from "../../lib/db";
import { body, handle } from "../../lib/http";

export const POST: APIRoute = ({ request }) =>
  handle(async () => {
    const b = await body(request);
    if (!b.device || !b.from || !b.to) throw Object.assign(new Error("Missing team"), { code: "P0001" });
    return one(
      `SELECT post_note(
          format('%s asks to vote as %s instead.',
                 (SELECT team_name FROM teams WHERE team_id = $2::uuid),
                 (SELECT team_name FROM teams WHERE team_id = $3::uuid)),
          ARRAY['team_change_request', 'device:' || $1, 'to:' || $3],
          $2::uuid) AS id`,
      [b.device, b.from, b.to]);
  });

export const GET: APIRoute = ({ url }) =>
  handle(async () => {
    const device = url.searchParams.get("device") ?? "";
    const row = await one<{ tags: string[] }>(
      `SELECT tags FROM notes WHERE 'team_change_approved' = ANY(tags) AND ('device:' || $1) = ANY(tags)
       ORDER BY created_at DESC LIMIT 1`, [device]);
    const to = row?.tags.find((t) => t.startsWith("to:"))?.slice(3);
    return to ? { to } : null;
  });
