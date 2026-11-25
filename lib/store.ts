import { Redis } from "@upstash/redis";

/** The tiny key-value surface the app needs. Values are JSON. */
export interface Store {
  get<T>(key: string): Promise<T | null>;
  /** Returns false if `nx` is set and the key already exists. */
  set(key: string, value: unknown, opts?: { nx?: boolean }): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
}

class RedisStore implements Store {
  constructor(private redis: Redis) {}
  async get<T>(key: string) {
    return (await this.redis.get<T>(key)) ?? null;
  }
  async set(key: string, value: unknown, opts?: { nx?: boolean }) {
    const res = opts?.nx ? await this.redis.set(key, value, { nx: true }) : await this.redis.set(key, value);
    return res === "OK";
  }
  async del(...keys: string[]) {
    if (keys.length) await this.redis.del(...keys);
  }
}

/** In-memory store for tests and for running locally without Redis. */
export class MemoryStore implements Store {
  data = new Map<string, string>();
  async get<T>(key: string) {
    const v = this.data.get(key);
    return v === undefined ? null : (JSON.parse(v) as T);
  }
  async set(key: string, value: unknown, opts?: { nx?: boolean }) {
    if (opts?.nx && this.data.has(key)) return false;
    this.data.set(key, JSON.stringify(value));
    return true;
  }
  async del(...keys: string[]) {
    for (const k of keys) this.data.delete(k);
  }
}

const g = globalThis as unknown as { __familyDrawStore?: Store; __warnedMemory?: boolean };

export function hasRedisEnv(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  );
}

export function getStore(): Store {
  if (g.__familyDrawStore) return g.__familyDrawStore;
  if (hasRedisEnv()) {
    g.__familyDrawStore = new RedisStore(Redis.fromEnv());
  } else {
    if (process.env.VERCEL) {
      throw new Error("Redis is not configured. Connect Upstash Redis to this Vercel project.");
    }
    if (!g.__warnedMemory) {
      console.warn("[family-draw] No Redis env vars found. Using an in-memory store; data is lost on restart.");
      g.__warnedMemory = true;
    }
    g.__familyDrawStore = new MemoryStore();
  }
  return g.__familyDrawStore;
}

/** Tests only. */
export function setStoreForTests(store: Store | undefined) {
  g.__familyDrawStore = store;
}
