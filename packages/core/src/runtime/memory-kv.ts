import type {
  ConnectedKv,
  KV,
  KvListOptions,
  KvListResult,
  KvPutOptions,
} from "./slots.js";

interface MemoryEntry {
  readonly value: string;
  /** Unix ms at which the entry expires, or undefined for no expiry. */
  readonly expiresAt?: number;
}

export interface MemoryKvConfig {
  readonly seed?: Readonly<Record<string, string>>;
}

/**
 * In-memory {@link KV} adapter — the dev/test stand-in for a real Workers KV
 * namespace. Honors `expirationTtl` against wall-clock time so TTL behavior can
 * be exercised with fake timers.
 */
export function memoryKv(config: MemoryKvConfig = {}): KV {
  const store = new Map<string, MemoryEntry>();

  if (config.seed) {
    for (const [key, value] of Object.entries(config.seed)) {
      store.set(key, { value });
    }
  }

  // Read-through expiry: drop the entry lazily on access so `get`/`list` never
  // surface a stale value and the map doesn't grow with dead keys.
  const live = (key: string): MemoryEntry | undefined => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };

  const connected: ConnectedKv = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async get(key) {
      return live(key)?.value ?? null;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async put(key, value, opts?: KvPutOptions) {
      const ttl = opts?.expirationTtl;
      // Mirror the platform: Workers KV rejects sub-60s TTLs at write time, so
      // the stand-in must too — otherwise a bad TTL passes dev/tests and throws
      // only in production.
      if (ttl !== undefined && ttl < 60) {
        throw new RangeError(
          `memoryKv: expirationTtl must be at least 60 seconds, got ${String(ttl)}`,
        );
      }
      const expiresAt = ttl !== undefined ? Date.now() + ttl * 1000 : undefined;
      store.set(key, { value, expiresAt });
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async delete(key) {
      store.delete(key);
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async list(opts: KvListOptions = {}): Promise<KvListResult> {
      // Clamp to the platform's 1..1000 range; a floor of 1 also stops a
      // `limit: 0` from returning an empty page with a live cursor forever.
      const limit = Math.min(Math.max(opts.limit ?? 1000, 1), 1000);
      const keys = [...store.keys()]
        .filter((key) => live(key) !== undefined)
        .filter((key) => !opts.prefix || key.startsWith(opts.prefix))
        .sort();
      const start = opts.cursor ? Number(opts.cursor) || 0 : 0;
      const page = keys.slice(start, start + limit);
      const next = start + page.length;
      const listComplete = next >= keys.length;
      return {
        keys: page,
        cursor: listComplete ? undefined : String(next),
        listComplete,
      };
    },
  };

  return {
    kind: "memory",
    connect: () => connected,
  };
}
