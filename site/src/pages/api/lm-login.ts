// POST (form) { code, next } from /lm-login: signs this device in as the LM, then goes to `next`.
import type { APIRoute } from "astro";
import { safeNext, signIn } from "../../lib/lm-auth";

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => new FormData());
  const next = safeNext(String(form.get("next") ?? ""));
  const cookie = await signIn(String(form.get("code") ?? ""));
  if (!cookie) {
    await new Promise((r) => setTimeout(r, 800));   // slow down guessing
    return new Response(null, { status: 303, headers: { location: `/lm-login?bad=1&next=${encodeURIComponent(next)}` } });
  }
  return new Response(null, { status: 303, headers: { location: next, "set-cookie": cookie } });
};
