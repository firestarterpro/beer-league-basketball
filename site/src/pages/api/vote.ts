// POST { poll_id, team_id, response } -> cast or change a ballot.
import type { APIRoute } from "astro";
import { one } from "../../lib/db";
import { body, handle } from "../../lib/http";

export const POST: APIRoute = ({ request }) =>
  handle(async () => {
    const b = await body(request);
    return one("SELECT cast_ballot($1, $2, $3::jsonb) AS id", [b.poll_id, b.team_id, JSON.stringify(b.response ?? {})]);
  });
