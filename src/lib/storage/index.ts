import { env } from 'cloudflare:workers';
import { createDatabaseStore } from './database';
import { createR2Store } from './r2';
import type { BlobStore } from './types';

export type { BlobStore, StoredObject } from './types';

let cached: BlobStore | null = null;

/**
 * Picks the blob backend. `BLOB_STORE` can be `r2`, `database` or `auto`
 * (the default). Auto uses the R2 binding when one is declared and falls back
 * to the database, so the app runs with or without Cloudflare R2.
 */
export function getBlobStore(): BlobStore {
  if (cached) return cached;
  const configured = (env.BLOB_STORE ?? 'auto').toLowerCase();
  const bucket = (env as unknown as { ATTACHMENTS?: Parameters<typeof createR2Store>[0] }).ATTACHMENTS;

  if (configured === 'r2' && bucket) cached = createR2Store(bucket);
  else if (configured === 'database' || configured === 'db') cached = createDatabaseStore();
  else cached = bucket ? createR2Store(bucket) : createDatabaseStore();

  return cached;
}
