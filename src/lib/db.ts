import { env } from 'cloudflare:workers';
import { createDb, type Client, type InArgs, type ResultSet } from './db-client';

/**
 * App-facing database access. Reads Turso credentials from the Worker runtime
 * (`wrangler.jsonc` vars + secrets / `.dev.vars` locally) and caches one client
 * per isolate.
 */
let cached: Client | null = null;
let cachedKey = '';

export function getDb(): Client {
  const url = env.TURSO_DATABASE_URL;
  const token = env.TURSO_AUTH_TOKEN ?? '';
  const key = `${url}\u0000${token}`;
  if (!cached || cachedKey !== key) {
    cached = createDb(url, token);
    cachedKey = key;
  }
  return cached;
}

export async function run(sql: string, args: InArgs = []): Promise<ResultSet> {
  return getDb().execute({ sql, args });
}

export async function queryAll<T>(sql: string, args: InArgs = []): Promise<T[]> {
  const rs = await run(sql, args);
  return rs.rows as unknown as T[];
}

export async function queryOne<T>(sql: string, args: InArgs = []): Promise<T | null> {
  const rows = await queryAll<T>(sql, args);
  return rows[0] ?? null;
}

/** libSQL returns integer columns as bigint; normalize to number for JSON. */
export function asNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return Number(value ?? 0);
}
