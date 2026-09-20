/**
 * Tiny in-memory sliding-window rate limiter, isolated per Worker isolate.
 *
 * This blunts simple brute-force attacks against /api/auth/login. It is
 * intentionally best-effort (isolates are ephemeral and regional); if you need
 * a hard global limit, swap the Map for a Workers KV or Durable Object counter.
 */
interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function hit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  if (buckets.size > MAX_KEYS) buckets.clear();

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] as number;
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.timestamps.length, retryAfterSeconds: 0 };
}

export function reset(key: string): void {
  buckets.delete(key);
}
