import type { BlobStore, StoredObject } from './types';

interface R2LikeObject {
  body: ReadableStream | null;
  size: number;
  httpMetadata?: { contentType?: string } | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2LikeBucket {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2LikeObject | null>;
  delete(key: string | string[]): Promise<unknown>;
}

export function createR2Store(bucket: R2LikeBucket): BlobStore {
  return {
    id: 'r2',
    async put(key, body, contentType) {
      await bucket.put(key, body, contentType ? { httpMetadata: { contentType } } : undefined);
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      const stored: StoredObject = {
        body: object.body,
        size: object.size,
        contentType: object.httpMetadata?.contentType ?? null,
        arrayBuffer: () => object.arrayBuffer(),
      };
      return stored;
    },
    async delete(keys) {
      await Promise.all(
        keys.map(async (key) => {
          try {
            await bucket.delete(key);
          } catch (error) {
            console.warn(`[storage] failed to delete ${key} from R2`, error);
          }
        }),
      );
    },
  };
}
