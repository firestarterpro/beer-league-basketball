// Sync Now. The button stores a request in Cloudflare KV; the LM's PC checks
// this endpoint every minute, runs the sync, and posts back when it's done.
// KV is used instead of Neon so the PC's checks never wake the database.
//   GET                          -> { enabled, requested_at, done_at, ok }
//   POST {}                      -> request a sync (a second press while one is waiting does nothing)
//   POST { done_at, requested_at, ok }  -> the PC reporting back
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { body, json } from "../../lib/http";

type State = { requested_at?: string; done_at?: string; ok?: boolean };
type KV = { get(key: string, type: "json"): Promise<State | null>; put(key: string, value: string): Promise<void> };
const KEY = "sync";

function store(): KV | undefined {
  return (env as unknown as { SYNC?: KV }).SYNC;
}

export const GET: APIRoute = async () => {
  const kv = store();
  if (!kv) return json({ ok: true, data: { enabled: false } });
  return json({ ok: true, data: { enabled: true, ...((await kv.get(KEY, "json")) ?? {}) } });
};

export const POST: APIRoute = async ({ request }) => {
  const kv = store();
  if (!kv) return json({ ok: false, error: "Sync Now isn't set up yet. The LM adds it in Cloudflare." }, 400);
  const state = (await kv.get(KEY, "json")) ?? {};
  const b = await body(request);
  if (b.done_at) {
    // the PC finished; keep a newer press that came in while it was syncing
    const next: State = { ...state, done_at: new Date(String(b.done_at)).toISOString(), ok: Boolean(b.ok) };
    await kv.put(KEY, JSON.stringify(next));
    return json({ ok: true, data: next });
  }
  const waiting = state.requested_at && (!state.done_at || state.requested_at > state.done_at);
  if (waiting) return json({ ok: true, data: { enabled: true, ...state } });
  const next: State = { ...state, requested_at: new Date().toISOString() };
  await kv.put(KEY, JSON.stringify(next));
  return json({ ok: true, data: { enabled: true, ...next } });
};
