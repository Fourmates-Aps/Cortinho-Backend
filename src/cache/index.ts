// Cache layer with an in-process Map store.
// Replace set/get/del implementations with ioredis when REDIS_URL is set
// — the interface is identical so no call-site changes are needed.

import { logger } from "../logger/index.js";

interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  flush(): Promise<void>;
}

// ── In-process store (development / single-instance) ─────────
interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

const store = new Map<string, CacheEntry<unknown>>();

function isExpired(entry: CacheEntry<unknown>): boolean {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}

export const cache: CacheStore = {
  async get<T>(key: string): Promise<T | null> {
    const entry = store.get(key) as CacheEntry<T> | undefined;
    if (!entry || isExpired(entry)) {
      if (entry) store.delete(key);
      return null;
    }
    return entry.value;
  },

  async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    store.set(key, {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  },

  async del(key: string): Promise<void> {
    store.delete(key);
  },

  async flush(): Promise<void> {
    store.clear();
  },
};

// ── Cache key helpers ─────────────────────────────────────────
export const CacheKey = {
  userCards:   (userId: number) => `user:${userId}:cards`,
  userProfile: (userId: number) => `user:${userId}:profile`,
  cardDetail:  (cardId: number) => `card:${cardId}`,
  jwks:        ()               => "clerk:jwks",
};

// ── Cache-aside wrapper ───────────────────────────────────────
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== null) return hit;
  const value = await fetcher();
  await cache.set(key, value, ttlSeconds);
  return value;
}

// Periodic GC for in-process store (purge expired keys)
setInterval(() => {
  let purged = 0;
  for (const [key, entry] of store.entries()) {
    if (isExpired(entry)) { store.delete(key); purged++; }
  }
  if (purged > 0) logger.debug({ purged }, "Cache GC run");
}, 60_000).unref();
