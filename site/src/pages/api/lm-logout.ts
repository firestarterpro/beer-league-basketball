// GET: signs this device out of the LM pages.
import type { APIRoute } from "astro";
import { signOutCookie } from "../../lib/lm-auth";

export const GET: APIRoute = () =>
  new Response(null, { status: 303, headers: { location: "/lm-login?out=1", "set-cookie": signOutCookie } });
