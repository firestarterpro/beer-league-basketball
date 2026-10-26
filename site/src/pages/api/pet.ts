// Masco-Pets league save. Open to everyone except the commissioner ops in LM_OPS (LM passcode).
// GET  -> { pets, gifts, settings }   every team's pet, open commissioner gifts, live tuning
// POST { op: "push", team_id, kind, device_id, state }   save a pet (newest real change wins)
// POST { op: "gift", title, team_id?, fx }                commissioner gift (Pet desk)
// POST { op: "settings", overrides }                      live tuning (Pet desk)
// POST { op: "reset", team_id }                           rehatch: back to an egg on every device (Pet desk)
// POST { op: "avatar_request", team_id, note? }           "New avatar?" button: a private note for the LM desk
// POST { op: "avatar_done", note_id }                     LM marks an avatar request done
import type { APIRoute } from "astro";
import { one, query } from "../../lib/db";
import { body, handle, json } from "../../lib/http";
import { LM_DENIED, isLM } from "../../lib/lm-auth";

const FX_KEYS = ["tokens", "points", "power", "hunger", "happy", "energy", "fireHours", "superHours", "spins"];
const num = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));
const ts = (ms: unknown) => (Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null);
const fail = (msg: string) => Object.assign(new Error(msg), { code: "P0001" });

function cleanFx(fx: Record<string, unknown> = {}) {
  const out: Record<string, number> = {};
  for (const k of FX_KEYS) if (fx[k]) out[k] = num(fx[k], -1000, 1000);
  return out;
}

const ops: Record<string, (b: Record<string, any>) => Promise<unknown>> = {
  async push(b) {
    const s = b.state;
    if (!s || typeof s !== "object") throw fail("No pet to save.");
    const raw = JSON.stringify(s);
    if (raw.length > 20000) throw fail("That pet is too big to save.");
    const acted = num(s.actedAt, 0, Date.now() + 60000);
    if (!acted) throw fail("Nothing to save yet.");
    const kind = ["auto", "sync", "manual"].includes(b.kind) ? b.kind : "auto";
    // Upsert only when this copy is newer; either way return what the league now holds.
    await query(
      `INSERT INTO pets (team_id, state, power, fire_until, super_until, acted_at, push_kind, pushed_by, updated_at)
       SELECT team_id, $2::jsonb, $3, $4::timestamptz, $5::timestamptz, $6::timestamptz, $7, $8, now()
       FROM teams WHERE team_id = $1 AND active
       ON CONFLICT (team_id) DO UPDATE SET state = EXCLUDED.state, power = EXCLUDED.power,
         fire_until = EXCLUDED.fire_until, super_until = EXCLUDED.super_until, acted_at = EXCLUDED.acted_at,
         push_kind = EXCLUDED.push_kind, pushed_by = EXCLUDED.pushed_by, updated_at = now()
       WHERE pets.acted_at <= EXCLUDED.acted_at`,
      [b.team_id, raw, num(s.power, 0, 100000), ts(s.fireUntil), ts(s.superUntil), ts(acted), kind, String(b.device_id || "").slice(0, 64)]);
    return one("SELECT state, acted_at, updated_at FROM pets WHERE team_id = $1", [b.team_id]);
  },
  gift: (b) => {
    const title = String(b.title || "").trim().slice(0, 80);
    if (!title) throw fail("Give the gift a name.");
    const fx = cleanFx(b.fx);
    if (!Object.keys(fx).length) throw fail("Pick at least one prize.");
    return one(`INSERT INTO pet_gifts (title, team_id, fx, expires_at)
                VALUES ($1, $2, $3::jsonb, now() + make_interval(days => $4)) RETURNING id`,
      [title, b.team_id || null, JSON.stringify(fx), num(b.days || 14, 1, 90)]);
  },
  settings: (b) => {
    if (!b.overrides || typeof b.overrides !== "object") throw fail("Nothing to save.");
    return one(`UPDATE pet_settings SET overrides = $1::jsonb, updated_at = now() WHERE id = 1 RETURNING updated_at`,
      [JSON.stringify(b.overrides)]);
  },
  // A newer egg wins over every device's copy at its next sync.
  reset: (b) => {
    const egg = JSON.stringify({ egg: true, actedAt: Date.now() });
    return one(`UPDATE pets SET state = $2::jsonb, power = 0, fire_until = NULL, super_until = NULL,
                  acted_at = now(), push_kind = 'manual', updated_at = now()
                WHERE team_id = $1 RETURNING team_id`, [b.team_id, egg]);
  },
  // Hidden notes (visible = false) so requests never show in the public feed. The note is the
  // image link the GM pasted. One open request per team: a newer link replaces the open one.
  async avatar_request(b) {
    const note = String(b.note || "").trim().slice(0, 500);
    if (!/^https?:\/\/\S+$/i.test(note)) throw fail("Paste a link to the image (it starts with http).");
    const open = await one(`UPDATE notes SET body = $2, created_at = now()
                            WHERE 'avatar_request' = ANY(tags) AND NOT 'avatar_done' = ANY(tags) AND author_team_id = $1
                            RETURNING id`, [b.team_id, note]);
    if (open) return { already: true };
    return one(`INSERT INTO notes (body, tags, author_team_id, visible)
                SELECT $2, ARRAY['avatar_request'], team_id, false FROM teams WHERE team_id = $1 AND active RETURNING id`,
      [b.team_id, note]);
  },
  avatar_done: (b) =>
    one(`UPDATE notes SET tags = array_append(tags, 'avatar_done')
         WHERE id = $1 AND 'avatar_request' = ANY(tags) AND NOT 'avatar_done' = ANY(tags) RETURNING id`, [b.note_id]),
  end_gift: (b) => one("UPDATE pet_gifts SET expires_at = now() WHERE id = $1 RETURNING id", [b.gift_id]),
};

export const GET: APIRoute = () =>
  handle(async () => {
    const [pets, gifts, settings] = await Promise.all([
      query(`SELECT t.team_id, lower(t.abv) AS abv, t.team_name, p.state, p.power, p.fire_until, p.super_until, p.acted_at, p.updated_at
             FROM teams t LEFT JOIN pets p USING (team_id) WHERE t.active ORDER BY t.team_name`),
      query(`SELECT id, title, team_id, fx, created_at FROM pet_gifts WHERE expires_at > now() ORDER BY created_at`),
      one(`SELECT overrides FROM pet_settings WHERE id = 1`),
    ]);
    return { pets, gifts, settings: settings?.overrides ?? {} };
  });

// Commissioner-only ops (Pet desk, LM desk) need the LM passcode. push and avatar_request stay open.
const LM_OPS = new Set(["gift", "settings", "reset", "end_gift", "avatar_done"]);

export const POST: APIRoute = async ({ request }) => {
  const b = await body(request);
  if (LM_OPS.has(b.op) && !(await isLM(request))) return json({ ok: false, error: LM_DENIED }, 401);
  return handle(async () => {
    const op = ops[b.op];
    if (!op) throw fail("Unknown pet action.");
    return op(b);
  });
};
