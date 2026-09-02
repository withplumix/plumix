import { expect } from "vitest";

import type { ConnectedKv } from "../../runtime/slots.js";
import type { ContractCase } from "./case.js";
import { describeContract, drainKeys } from "./case.js";

const SHORT_TTL_SECONDS = 5;

export interface KvContractOptions {
  /**
   * Bind a store for one case. Every case gets its own, so the returned store
   * must start empty and must not share keys with a previously returned one.
   */
  readonly connect: () => ConnectedKv | Promise<ConnectedKv>;
  /**
   * Smallest `expirationTtl` the backend accepts, in seconds. Workers KV
   * rejects anything under 60; a store with no floor omits this. Cases that
   * would write a shorter TTL are skipped.
   */
  readonly minTtlSeconds?: number;
  /**
   * Move the store's clock forward by `ms`. Omit for a backend whose clock the
   * test cannot control — the TTL cases are then skipped rather than slept
   * through, which leaves expiry, the port's one time-dependent guarantee,
   * unproven. Supply it wherever the rig can.
   */
  readonly advanceTime?: (ms: number) => void | Promise<void>;
}

type Case = ContractCase<KvContractOptions>;

function ttlFloor(options: KvContractOptions): number {
  return options.minTtlSeconds ?? 1;
}

function noClock(options: KvContractOptions): string | null {
  return options.advanceTime ? null : "the factory declares no advanceTime";
}

async function advance(
  options: KvContractOptions,
  seconds: number,
): Promise<void> {
  await options.advanceTime?.(seconds * 1000);
}

function drain(
  kv: ConnectedKv,
  opts: { readonly prefix?: string; readonly limit: number },
): Promise<string[]> {
  return drainKeys(async (cursor) => {
    const page = await kv.list({ ...opts, cursor });
    return {
      keys: page.keys,
      cursor: page.cursor,
      complete: page.listComplete,
    };
  });
}

async function seed(
  options: KvContractOptions,
  entries: Readonly<Record<string, string>>,
): Promise<ConnectedKv> {
  const kv = await options.connect();
  for (const [key, value] of Object.entries(entries)) {
    await kv.put(key, value);
  }
  return kv;
}

/** Every case of the kv contract, for guard tests that run them outside vitest. */
export const kvContractCases: readonly Case[] = [
  {
    name: "put then get returns the stored value",
    run: async (options) => {
      const kv = await options.connect();
      await kv.put("k", "v");
      expect(await kv.get("k")).toBe("v");
    },
  },
  {
    name: "get returns null for a key that was never written",
    run: async (options) => {
      const kv = await options.connect();
      expect(await kv.get("missing")).toBeNull();
    },
  },
  {
    name: "put overwrites an existing value",
    run: async (options) => {
      const kv = await options.connect();
      await kv.put("k", "first");
      await kv.put("k", "second");
      expect(await kv.get("k")).toBe("second");
    },
  },
  {
    name: "delete removes a key",
    run: async (options) => {
      const kv = await options.connect();
      await kv.put("k", "v");
      await kv.delete("k");
      expect(await kv.get("k")).toBeNull();
    },
  },
  {
    name: "delete of a key that is not there resolves",
    run: async (options) => {
      const kv = await options.connect();
      await expect(kv.delete("missing")).resolves.toBeUndefined();
    },
  },
  {
    name: "list returns the keys that were written",
    run: async (options) => {
      const kv = await seed(options, { a: "1", b: "2" });
      expect([...(await kv.list()).keys].sort()).toEqual(["a", "b"]);
    },
  },
  {
    name: "list omits a deleted key",
    run: async (options) => {
      const kv = await seed(options, { a: "1", b: "2" });
      await kv.delete("a");
      expect((await kv.list()).keys).toEqual(["b"]);
    },
  },
  {
    name: "prefix filters the listing",
    run: async (options) => {
      const kv = await seed(options, { "u:1": "a", "u:2": "b", "x:1": "c" });
      const result = await kv.list({ prefix: "u:" });
      expect([...result.keys].sort()).toEqual(["u:1", "u:2"]);
    },
  },
  {
    name: "limit is honoured as an upper bound on the page",
    run: async (options) => {
      const kv = await seed(options, { a: "1", b: "2", c: "3", d: "4" });
      const result = await kv.list({ limit: 2 });
      // An upper bound, not an exact count: a backend is free to return fewer.
      expect(result.keys.length).toBeGreaterThan(0);
      expect(result.keys.length).toBeLessThanOrEqual(2);
    },
  },
  {
    name: "a truncated page carries a cursor and a complete one does not",
    run: async (options) => {
      const kv = await seed(options, { a: "1", b: "2", c: "3" });
      const page = await kv.list({ limit: 2 });
      expect(page.listComplete).toBe(false);
      expect(page.cursor).toBeTypeOf("string");
      const rest = await kv.list({ limit: 100, cursor: page.cursor });
      expect(rest.listComplete).toBe(true);
      expect(rest.cursor).toBeUndefined();
    },
  },
  {
    name: "the cursor resumes the listing with every key seen exactly once",
    run: async (options) => {
      const kv = await seed(options, {
        a: "1",
        b: "2",
        c: "3",
        d: "4",
        e: "5",
      });
      expect(await drain(kv, { limit: 2 })).toEqual(["a", "b", "c", "d", "e"]);
    },
  },
  {
    name: "prefix and cursor combine across pages",
    run: async (options) => {
      const kv = await seed(options, {
        "u:1": "a",
        "u:2": "b",
        "u:3": "c",
        "x:1": "d",
      });
      expect(await drain(kv, { prefix: "u:", limit: 2 })).toEqual([
        "u:1",
        "u:2",
        "u:3",
      ]);
    },
  },
  {
    name: "an entry is gone once its expirationTtl elapses",
    skip: noClock,
    run: async (options) => {
      const ttl = ttlFloor(options);
      const kv = await options.connect();
      await kv.put("k", "v", { expirationTtl: ttl });
      expect(await kv.get("k")).toBe("v");
      await advance(options, ttl + 1);
      expect(await kv.get("k")).toBeNull();
    },
  },
  {
    name: "an expired entry drops out of the listing",
    skip: noClock,
    run: async (options) => {
      const ttl = ttlFloor(options);
      const kv = await options.connect();
      await kv.put("keep", "1");
      await kv.put("gone", "2", { expirationTtl: ttl });
      await advance(options, ttl + 1);
      expect((await kv.list()).keys).toEqual(["keep"]);
    },
  },
  {
    name: "a put without a ttl clears a previously set expiry",
    skip: noClock,
    run: async (options) => {
      const ttl = ttlFloor(options);
      const kv = await options.connect();
      await kv.put("k", "v", { expirationTtl: ttl });
      await kv.put("k", "v2");
      await advance(options, ttl * 2 + 1);
      expect(await kv.get("k")).toBe("v2");
    },
  },
  {
    // Redundant against the case above for a store with no floor, and skipped
    // for one that has a floor above 5s. It is here so a backend that quietly
    // rounds a short TTL up to its own minimum is caught saying it did not.
    name: "an expirationTtl of 5s expires on time",
    skip: (options) =>
      noClock(options) ??
      (ttlFloor(options) > SHORT_TTL_SECONDS
        ? `the backend floors expirationTtl at ${String(ttlFloor(options))}s`
        : null),
    run: async (options) => {
      const kv = await options.connect();
      await kv.put("k", "v", { expirationTtl: SHORT_TTL_SECONDS });
      expect(await kv.get("k")).toBe("v");
      await advance(options, SHORT_TTL_SECONDS + 1);
      expect(await kv.get("k")).toBeNull();
    },
  },
];

/**
 * Assert an implementation of the `kv:` slot satisfies its port. Call it at
 * the top level of a test file with a factory that binds a fresh store.
 */
export function describeKvContract(options: KvContractOptions): void {
  describeContract("kv contract", kvContractCases, options);
}
