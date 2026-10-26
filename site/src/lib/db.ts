// One place that talks to Postgres.
// On Neon (production) it uses Neon's serverless HTTP driver: one request per
// query, no pooled connections, so the database can scale to zero.
// Anywhere else (local testing) it opens a short-lived node-postgres client.
import { env } from "cloudflare:workers";
import { neon } from "@neondatabase/serverless";

type Row = Record<string, any>;

function databaseUrl(): string {
  const url = (env as Record<string, string | undefined>).DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .dev.vars.example)");
  return url;
}

export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const url = databaseUrl();
  if (url.includes(".neon.tech")) {
    const sql = neon(url);
    return (await sql.query(text, params)) as T[];
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function one<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(text, params))[0];
}

export function setting(name: string): string {
  return (env as Record<string, string | undefined>)[name] ?? "";
}
