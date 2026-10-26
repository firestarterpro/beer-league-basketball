// JSON helpers for the /api endpoints. Errors raised by the database
// functions (RAISE EXCEPTION) are plain-English, so they go straight to the page.
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return json({ ok: true, data: await fn() });
  } catch (err: any) {
    // Postgres user-facing errors carry code P0001 (RAISE) or 23xxx (constraint)
    const userError = typeof err?.code === "string" && /^(P0001|23|22)/.test(err.code);
    console.error(err);
    return json({ ok: false, error: userError ? err.message : "Something went wrong. Try again." }, userError ? 400 : 500);
  }
}

export async function body(request: Request): Promise<Record<string, any>> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
