// League Manager actions. Need the LM passcode (middleware.ts + lib/lm-auth.ts); GMs never log in.
// POST { op, ...fields }. Each op maps to one database function or update.
import type { APIRoute } from "astro";
import { one } from "../../lib/db";
import { body, handle } from "../../lib/http";

const ops: Record<string, (b: Record<string, any>) => Promise<unknown>> = {
  create_poll: (b) =>
    one("SELECT create_poll($1, $2, $3::text[], $4, $5::timestamptz) AS id", [
      b.question, b.type, (b.options ?? []).filter((o: string) => o.trim()), b.description || null, b.closes_at || null,
    ]),
  scrub_poll: () => one("SELECT create_scrub_poll() AS id"),
  close_poll: (b) => one("SELECT close_poll($1) AS outcome", [b.poll_id]),
  process_action: (b) => one("SELECT process_action($1, $2, $3)", [b.request_id, b.executed === true, b.notes || null]),
  post_note: (b) => one("SELECT post_note($1, $2::text[]) AS id", [b.body, ["announcement"]]),
  hide_note: (b) => one("UPDATE notes SET visible = false WHERE id = $1 RETURNING id", [b.note_id]),
  approve_team_change: (b) =>
    one(`SELECT post_note('LM approved a voting-team change.',
                          ARRAY['team_change_approved', 'device:' || $1, 'to:' || $2]) AS id`, [b.device, b.to]),
  // The whole Teams section in one save: rows with a team_id are updated, rows without one are new teams.
  save_teams: (b) => {
    const rows = (Array.isArray(b.teams) ? b.teams : []).map((t: Record<string, any>) => ({
      team_id: t.team_id || null,
      team_name: String(t.team_name ?? "").trim(),
      abv: String(t.abv ?? "").trim().toUpperCase(),
      gm_name: String(t.gm_name ?? "").trim() || null,
      manager_assigned: t.manager_assigned === true,
      uses_web_actions: t.uses_web_actions === true,
    }));
    if (rows.length === 0) throw Object.assign(new Error("No teams to save."), { code: "P0001" });
    for (const r of rows) {
      if (!r.team_name) throw Object.assign(new Error("Every team needs a name."), { code: "P0001" });
      if (!/^[A-Z0-9]{2,4}$/.test(r.abv)) throw Object.assign(new Error(`"${r.abv || "(blank)"}" isn't a valid abbreviation: use 2–4 letters or digits.`), { code: "P0001" });
    }
    const abvs = rows.map((r: { abv: string }) => r.abv);
    const dupe = abvs.find((a: string, i: number) => abvs.indexOf(a) !== i);
    if (dupe) throw Object.assign(new Error(`Two teams use the abbreviation ${dupe}.`), { code: "P0001" });
    return one(
      `WITH input AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb)
           AS x(team_id uuid, team_name text, abv text, gm_name text, manager_assigned boolean, uses_web_actions boolean)),
       upd AS (
         UPDATE teams t SET team_name = i.team_name, abv = i.abv, gm_name = i.gm_name,
                manager_assigned = i.manager_assigned, uses_web_actions = i.uses_web_actions, updated_at = now()
         FROM input i WHERE t.team_id = i.team_id RETURNING t.team_id),
       ins AS (
         INSERT INTO teams (team_name, abv, gm_name, manager_assigned, uses_web_actions, active)
         SELECT team_name, abv, gm_name, manager_assigned, uses_web_actions, true FROM input WHERE team_id IS NULL
         RETURNING team_id),
       st AS (INSERT INTO standings (team_id, total_points) SELECT team_id, 0 FROM ins RETURNING team_id)
       SELECT (SELECT count(*) FROM upd)::int AS updated, (SELECT count(*) FROM ins)::int AS added`,
      [JSON.stringify(rows)]);
  },
};

export const POST: APIRoute = ({ request }) =>
  handle(async () => {
    const b = await body(request);
    const op = ops[b.op];
    if (!op) throw Object.assign(new Error(`Unknown action "${b.op}"`), { code: "P0001" });
    return op(b);
  });
