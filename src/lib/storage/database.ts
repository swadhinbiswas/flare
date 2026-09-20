import { run, queryOne } from '../db';
import type { BlobStore, StoredObject } from './types';

/**
 * Blob store backed by Turso/libSQL. Fine for a single-owner mailbox and it
 * removes the R2 dependency entirely. Swap to R2 for large volumes.
 */
export function createDatabaseStore(): BlobStore {
  return {
    id: 'database',
    async put(key, body, contentType) {
      const bytes = new Uint8Array(body);
      await run(
        `INSERT INTO blobs (key, content, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET content = excluded.content, content_type = excluded.content_type,
           size_bytes = excluded.size_bytes, created_at = excluded.created_at`,
        [key, bytes, contentType ?? null, bytes.byteLength, new Date().toISOString()],
      );
    },
    async get(key) {
      const row = await queryOne<{ content: ArrayBuffer | Uint8Array; content_type: string | null; size_bytes: number }>(
        'SELECT content, content_type, size_bytes FROM blobs WHERE key = ?',
        [key],
      );
      if (!row) return null;
      const raw = row.content;
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
      // Copy into a standalone buffer: libSQL may reuse the underlying memory.
      const buffer = bytes.slice().buffer;
      const stored: StoredObject = {
        body: new Blob([buffer]).stream(),
        size: Number(row.size_bytes ?? buffer.byteLength),
        contentType: row.content_type ?? null,
        arrayBuffer: async () => buffer,
      };
      return stored;
    },
    async delete(keys) {
      for (const key of keys) {
        try {
          await run('DELETE FROM blobs WHERE key = ?', [key]);
        } catch (error) {
          console.warn(`[storage] failed to delete blob ${key}`, error);
        }
      }
    },
  };
}
