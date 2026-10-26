// Commissioner pages and actions need the LM passcode (see lib/lm-auth.ts). Everything else stays open.
// Masco-pet commissioner ops are checked in api/pet.ts, since they share an endpoint with the open ones.
import { defineMiddleware } from "astro:middleware";
import { json } from "./lib/http";
import { LM_DENIED, isLM } from "./lib/lm-auth";

const LM_PAGES = ["/lm", "/pet-desk"];
const LM_APIS = ["/api/lm"];
const under = (path: string, base: string) => path === base || path === base + "/" || path.startsWith(base + "/");

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  const path = url.pathname;
  if (LM_APIS.some((b) => under(path, b))) {
    if (!(await isLM(request))) return json({ ok: false, error: LM_DENIED }, 401);
  } else if (LM_PAGES.some((b) => under(path, b))) {
    if (!(await isLM(request))) {
      return new Response(null, { status: 303, headers: { location: `/lm-login?next=${encodeURIComponent(path + url.search)}` } });
    }
  }
  const res = await next();
  if (LM_PAGES.some((b) => under(path, b))) res.headers.set("cache-control", "private, no-store");
  return res;
});
