import { describe, expect, test } from "bun:test";

import { createRateLimiter, createTtlCache } from "./api-guard.ts";

describe("createTtlCache", () => {
  test("returns values until they expire", () => {
    const cache = createTtlCache<string>({ maxEntries: 10, ttlMs: 1000 });
    cache.set("a", "one", 0);
    expect(cache.get("a", 999)).toBe("one");
    expect(cache.get("a", 1000)).toBeUndefined();
  });

  test("evicts the least recently used entry when full", () => {
    const cache = createTtlCache<number>({ maxEntries: 2, ttlMs: 1000 });
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.get("a", 0);
    cache.set("c", 3, 0);
    expect(cache.get("a", 0)).toBe(1);
    expect(cache.get("b", 0)).toBeUndefined();
    expect(cache.get("c", 0)).toBe(3);
  });
});

describe("createRateLimiter", () => {
  test("allows `limit` requests per window per key", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.take("ip", 0)).toBe(true);
    expect(limiter.take("ip", 10)).toBe(true);
    expect(limiter.take("ip", 20)).toBe(false);
    expect(limiter.take("other", 20)).toBe(true);
    expect(limiter.take("ip", 1000)).toBe(true);
  });

  test("stays bounded under many distinct keys", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
    for (const key of ["a", "b", "c", "d"]) limiter.take(key, 0);
    // "a" was forgotten to make room, so it starts a fresh window.
    expect(limiter.take("a", 0)).toBe(true);
  });
});
