/** Minimal object-store contract shared by the R2 and database backends. */
export interface StoredObject {
  body: ReadableStream | null;
  size: number;
  contentType: string | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface BlobStore {
  readonly id: 'r2' | 'database';
  put(key: string, body: ArrayBuffer, contentType?: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(keys: string[]): Promise<void>;
}
