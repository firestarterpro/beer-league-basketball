// LM passcode (Jason, 2026-10-24): the commissioner pages (/lm, /pet-desk) and their write
// actions need one secret code, typed once per device. GMs never log in.
// The code is the Worker secret LM_PASSCODE (npx wrangler secret put LM_PASSCODE; locally .dev.vars).
// The device keeps a cookie holding an HMAC of the code, never the code itself, so changing
// the code signs every device out.
import { env } from "cloudflare:workers";

export const LM_COOKIE = "bl_lm";
const YEAR = 60 * 60 * 24 * 365;

const passcode = () => ((env as Record<string, unknown>).LM_PASSCODE as string | undefined)?.trim() || "";
export const lmConfigured = () => passcode() !== "";

async function tokenFor(code: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("beer-league-lm-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

/** True when this request comes from a device that entered the LM passcode. */
export async function isLM(request: Request) {
  const code = passcode();
  const have = readCookie(request, LM_COOKIE);
  return code !== "" && have !== "" && sameText(have, await tokenFor(code));
}

/** Check a typed code. Returns the Set-Cookie value to sign this device in, or null. */
export async function signIn(typed: string) {
  const code = passcode();
  if (!code || !sameText(typed.trim(), code)) return null;
  return `${LM_COOKIE}=${await tokenFor(code)}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`;
}

export const signOutCookie = `${LM_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** Only same-site paths after signing in, never another site. */
export const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/lm");

export const LM_DENIED = "This is a commissioner-only action. Enter the LM passcode on /lm-login first.";
