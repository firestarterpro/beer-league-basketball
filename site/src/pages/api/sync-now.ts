// Sync Now and the Updates page. The button stores a request in Cloudflare KV; the LM's PC checks
// this endpoint every minute, runs the sync, and posts back when it's done.
// KV is used instead of Neon so the PC's checks never wake the database.
//   GET                          -> { enabled, v, requested_at, done_at, ok, schedule, run, status, lm }
//   POST {}                      -> request a sync (a second press while one is waiting does nothing)
//   POST { done_at, requested_at, ok }  -> the PC reporting back
//   POST { status }              -> the PC's report for the Updates page (what ran, when, its schedule)
//   POST { schedule }            -> LM: change the PC's timings / paused jobs
//   POST { run: job }            -> LM: ask the PC to run one job now
// v tells the PC this site understands status posts (an older site would read one as a Sync Now press).
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { body, json } from "../../lib/http";
import { LM_DENIED, isLM } from "../../lib/lm-auth";
import { SYNC_JOB_KEYS, cleanSchedule } from "../../lib/sync-jobs";

type State = { requested_at?: string; done_at?: string; ok?: boolean };
type KV = { get(key: string, type: "json"): Promise<any>; put(key: string, value: string): Promise<void> };
const KEY = "sync";
const VERSION = 2;

function store(): KV | undefined {
  return (env as unknown as { SYNC?: KV }).SYNC;
}

async function everything(kv: KV, request: Request) {
  const [sync, schedule, run, status, lm] = await Promise.all([
    kv.get(KEY, "json"), kv.get("sync:schedule", "json"), kv.get("sync:run", "json"), kv.get("sync:status", "json"), isLM(request),
  ]);
  return { enabled: true, v: VERSION, ...(sync ?? {}), schedule: schedule ?? {}, run: run ?? null, status: status ?? null, lm };
}

export const GET: APIRoute = async ({ request }) => {
  const kv = store();
  if (!kv) return json({ ok: true, data: { enabled: false } });
  return json({ ok: true, data: await everything(kv, request) });
};

export const POST: APIRoute = async ({ request }) => {
  const kv = store();
  if (!kv) return json({ ok: false, error: "Sync Now isn't set up yet. The LM adds it in Cloudflare." }, 400);
  const b = await body(request);

  if (b.status && typeof b.status === "object") {
    const text = JSON.stringify({ ...b.status, received_at: new Date().toISOString() });
    if (text.length > 20000) return json({ ok: false, error: "Status too big." }, 400);
    await kv.put("sync:status", text);
    return json({ ok: true });
  }
  if ("schedule" in b || "run" in b) {
    if (!(await isLM(request))) return json({ ok: false, error: LM_DENIED }, 401);
    if ("schedule" in b) {
      await kv.put("sync:schedule", JSON.stringify(cleanSchedule(b.schedule ?? {})));
    } else {
      if (!SYNC_JOB_KEYS.includes(String(b.run))) return json({ ok: false, error: "Unknown job." }, 400);
      const [run, status] = await Promise.all([kv.get("sync:run", "json"), kv.get("sync:status", "json")]);
      if (run?.requested_at && run.requested_at !== status?.run_handled) {
        return json({ ok: false, error: `The PC hasn't picked up the last Run now (${run.job}) yet.` }, 409);
      }
      await kv.put("sync:run", JSON.stringify({ job: String(b.run), requested_at: new Date().toISOString() }));
    }
    return json({ ok: true, data: await everything(kv, request) });
  }

  const state: State = (await kv.get(KEY, "json")) ?? {};
  if (b.done_at) {
    // the PC finished; keep a newer press that came in while it was syncing
    const next: State = { ...state, done_at: new Date(String(b.done_at)).toISOString(), ok: Boolean(b.ok) };
    await kv.put(KEY, JSON.stringify(next));
    return json({ ok: true, data: next });
  }
  const waiting = state.requested_at && (!state.done_at || state.requested_at > state.done_at);
  if (waiting) return json({ ok: true, data: { enabled: true, v: VERSION, ...state } });
  const next: State = { ...state, requested_at: new Date().toISOString() };
  await kv.put(KEY, JSON.stringify(next));
  return json({ ok: true, data: { enabled: true, v: VERSION, ...next } });
};
