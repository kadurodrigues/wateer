/**
 * In-memory guards for the server functions that spend YouTube API quota.
 * They live per server instance, so on serverless they are best effort: they stop
 * a single client hammering a warm instance, not a determined distributed attack.
 */

export type TtlCache<V> = {
  get: (key: string, now?: number) => V | undefined;
  set: (key: string, value: V, now?: number) => void;
};

/** A small LRU cache whose entries expire after `ttlMs`. */
export function createTtlCache<V>({
  maxEntries,
  ttlMs,
}: {
  maxEntries: number;
  ttlMs: number;
}): TtlCache<V> {
  const entries = new Map<string, { value: V; expiresAt: number }>();
  return {
    get(key, now = Date.now()) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      if (entry.expiresAt <= now) return undefined;
      // Re-insert so the most recently used entry is evicted last.
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value, now = Date.now()) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now + ttlMs });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}

export type RateLimiter = {
  /** Count one request for `key`; false once the key is over its limit for this window. */
  take: (key: string, now?: number) => boolean;
};

/** Fixed-window rate limit per key. */
export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    take(key, now = Date.now()) {
      let window = windows.get(key);
      if (!window || window.resetAt <= now) {
        if (windows.size >= maxKeys) {
          for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
          // Still full of live windows: forget the oldest rather than grow without bound.
          if (windows.size >= maxKeys) {
            const oldest = windows.keys().next().value;
            if (oldest !== undefined) windows.delete(oldest);
          }
        }
        window = { count: 0, resetAt: now + windowMs };
        windows.set(key, window);
      }
      window.count += 1;
      return window.count <= limit;
    },
  };
}
