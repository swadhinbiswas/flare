import { createClient, type Client, type InArgs, type ResultSet } from '@libsql/client/web';

/**
 * Pure libSQL client factory. Deliberately free of any Cloudflare imports so it
 * can be used from both the Worker (src/lib/db.ts) and Node CLI scripts
 * (scripts/*.ts).
 */

/** The web client speaks HTTP(S); rewrite libsql:// URLs so it works on Workers. */
export function normalizeDbUrl(url: string): string {
  if (url.startsWith('libsql://')) return `https://${url.slice('libsql://'.length)}`;
  return url;
}

export function createDb(url: string, authToken?: string | null): Client {
  return createClient({
    url: normalizeDbUrl(url),
    authToken: authToken ? authToken : undefined,
  });
}

export type { Client, InArgs, ResultSet };
