// Shared saved views for the Stats table. Everyone sees and can use every view; only the device that saved
// a view can delete it (a copy someone else saved is theirs and stays). No logins: the owner is the device id
// from team.js (bl.deviceId), stored only as a hash. Lives in Cloudflare KV (the SYNC namespace), not Neon.
//   GET  ?device=<id>                                   -> [{ id, name, by, config, created_at, mine }]
//   POST { op: "save", device, name, by?, config }      -> the new view
//   POST { op: "delete", device, id }                   -> {}
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { body, json } from "../../lib/http";

type View = { id: string; name: string; by: string; config: unknown; created_at: string; owner: string };
type KV = { get(key: string, type: "json"): Promise<any>; put(key: string, value: string): Promise<void> };
const KEY = "stats:views";
const MAX_VIEWS = 200, MAX_CONFIG = 8000;

const store = () => (env as unknown as { SYNC?: KV }).SYNC;
async function hash(device: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bl-views:" + device));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, n);
const publicView = (v: View, me: string) => ({ id: v.id, name: v.name, by: v.by, config: v.config, created_at: v.created_at, mine: !!me && v.owner === me });

export const GET: APIRoute = async ({ url }) => {
  const kv = store();
  if (!kv) return json({ ok: true, data: [] });
  const device = url.searchParams.get("device") || "";
  const me = device ? await hash(device) : "";
  const views: View[] = (await kv.get(KEY, "json")) ?? [];
  return json({ ok: true, data: views.map((v) => publicView(v, me)) });
};

export const POST: APIRoute = async ({ request }) => {
  const kv = store();
  if (!kv) return json({ ok: false, error: "Saved views aren't set up yet." }, 400);
  const b = await body(request);
  const device = clean(b.device, 100);
  if (!device) return json({ ok: false, error: "This device has no id yet. Reload the page and try again." }, 400);
  const me = await hash(device);
  const views: View[] = (await kv.get(KEY, "json")) ?? [];

  if (b.op === "save") {
    const name = clean(b.name, 40);
    if (!name) return json({ ok: false, error: "Give the view a name." }, 400);
    const config = b.config && typeof b.config === "object" ? b.config : null;
    if (!config || JSON.stringify(config).length > MAX_CONFIG) return json({ ok: false, error: "That view is too big to save." }, 400);
    if (views.length >= MAX_VIEWS) return json({ ok: false, error: "The view shelf is full. Delete an old view first." }, 400);
    const v: View = { id: crypto.randomUUID(), name, by: clean(b.by, 60), config, created_at: new Date().toISOString(), owner: me };
    views.push(v);
    await kv.put(KEY, JSON.stringify(views));
    return json({ ok: true, data: publicView(v, me) });
  }
  if (b.op === "delete") {
    const v = views.find((x) => x.id === b.id);
    if (!v) return json({ ok: false, error: "That view is already gone." }, 404);
    if (v.owner !== me) return json({ ok: false, error: "Only the device that saved this view can delete it." }, 403);
    await kv.put(KEY, JSON.stringify(views.filter((x) => x.id !== v.id)));
    return json({ ok: true, data: {} });
  }
  return json({ ok: false, error: "Unknown request." }, 400);
};
