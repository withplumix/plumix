import { describeKvContract } from "plumix/test/conformance";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { KvError } from "./errors.js";
import { kv } from "./kv.js";

interface FakeNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

// Workers KV rejects a write asking for less than a minute of life. The fake
// enforces it so the conformance run proves the slot's declared floor is real
// rather than a comment.
const MIN_TTL_SECONDS = 60;

// In-test stand-in for a Workers KV namespace binding: lazy TTL expiry against
// the wall clock, sorted key listings, and a numeric-offset cursor — the
// behaviours the adapter maps onto the `kv:` port.
function fakeNamespace(): FakeNamespace {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  const live = (key: string): string | undefined => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  };

  return {
    get: (key) => Promise.resolve(live(key) ?? null),
    put: (key, value, options) => {
      const ttl = options?.expirationTtl;
      if (ttl !== undefined && ttl < MIN_TTL_SECONDS) {
        return Promise.reject(
          new Error(
            `Invalid expiration_ttl of ${String(ttl)}. Please specify integer greater than 60.`,
          ),
        );
      }
      store.set(key, {
        value,
        expiresAt: ttl === undefined ? undefined : Date.now() + ttl * 1000,
      });
      return Promise.resolve();
    },
    delete: (key) => {
      store.delete(key);
      return Promise.resolve();
    },
    list: (options = {}) => {
      const names = [...store.keys()]
        .filter((key) => live(key) !== undefined)
        .filter((key) => !options.prefix || key.startsWith(options.prefix))
        .sort();
      const limit = options.limit ?? 1000;
      const start = options.cursor ? Number(options.cursor) : 0;
      const page = names.slice(start, start + limit);
      const next = start + page.length;
      const complete = next >= names.length;
      return Promise.resolve({
        keys: page.map((name) => ({ name })),
        list_complete: complete,
        cursor: complete ? undefined : String(next),
      });
    },
  };
}

// The suite drives TTL through `advanceTime`, and the namespace reads the wall
// clock, so the whole file runs on fake timers.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describeKvContract({
  connect: () =>
    kv({ binding: "SESSIONS" }).connect({ SESSIONS: fakeNamespace() }),
  minTtlSeconds: MIN_TTL_SECONDS,
  advanceTime: (ms) => {
    vi.advanceTimersByTime(ms);
  },
});

describe("kv", () => {
  test("exposes kind, config, and requiredBindings", () => {
    const adapter = kv({ binding: "SESSIONS" });
    expect(adapter.kind).toBe("kv");
    expect(adapter.config.binding).toBe("SESSIONS");
    expect(adapter.requiredBindings).toEqual(["SESSIONS"]);
  });

  test("connect throws when the binding is missing", () => {
    expect(() => kv({ binding: "SESSIONS" }).connect({})).toThrow(KvError);
  });

  test("put forwards expirationTtl to the binding", async () => {
    const ns = fakeNamespace();
    const put = vi.spyOn(ns, "put");
    const store = kv({ binding: "SESSIONS" }).connect({ SESSIONS: ns });
    await store.put("k", "v", { expirationTtl: 3600 });
    await store.put("k2", "v");
    expect(put.mock.calls.map(([, , options]) => options)).toStrictEqual([
      { expirationTtl: 3600 },
      undefined,
    ]);
  });

  test("list forwards prefix, limit and cursor to the binding", async () => {
    const ns = fakeNamespace();
    const list = vi.spyOn(ns, "list");
    const store = kv({ binding: "SESSIONS" }).connect({ SESSIONS: ns });
    await store.list({ prefix: "u:", limit: 10 });
    expect(list.mock.calls).toStrictEqual([
      [{ prefix: "u:", limit: 10, cursor: undefined }],
    ]);
  });

  test("list drops the cursor when the binding reports the listing complete", async () => {
    const store = kv({ binding: "SESSIONS" }).connect({
      SESSIONS: {
        ...fakeNamespace(),
        list: () =>
          Promise.resolve({
            keys: [{ name: "a" }],
            list_complete: true,
            cursor: "leftover",
          }),
      },
    });
    const result = await store.list();
    expect(result.keys).toEqual(["a"]);
    expect(result.listComplete).toBe(true);
    expect(result.cursor).toBeUndefined();
  });
});
