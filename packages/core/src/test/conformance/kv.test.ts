import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ConnectedKv } from "../../runtime/contract/slots.js";
import { memoryKv } from "../../runtime/memory-kv.js";
import { failingCases } from "./case.js";
import { kvContractCases } from "./kv.js";

// A suite that cannot fail proves nothing, so the cases also run against stores
// broken the way real adapters ship broken.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function advanceTime(ms: number): void {
  vi.advanceTimersByTime(ms);
}

/** A store whose `list` treats `limit` as advice — the page overruns. */
function ignoresLimit(): ConnectedKv {
  const inner = memoryKv().connect({});
  return {
    ...inner,
    list: (opts) => inner.list({ ...opts, limit: 1000 }),
  };
}

/** A store that rejects sub-minute TTLs, the way Workers KV does. */
function withTtlFloor(floorSeconds: number): ConnectedKv {
  const inner = memoryKv().connect({});
  return {
    ...inner,
    put: (key, value, opts) => {
      const ttl = opts?.expirationTtl;
      if (ttl !== undefined && ttl < floorSeconds) {
        throw new Error(
          `expirationTtl below the ${String(floorSeconds)}s floor`,
        );
      }
      return inner.put(key, value, opts);
    },
  };
}

describe("kv contract cases", () => {
  test("fail a store whose list ignores limit", async () => {
    const failed = await failingCases(kvContractCases, {
      connect: ignoresLimit,
      advanceTime,
    });
    expect(failed).toContain("limit is honoured as an upper bound on the page");
  });

  test("never ask a store to beat the TTL floor it declares", async () => {
    const failed = await failingCases(kvContractCases, {
      connect: () => withTtlFloor(60),
      minTtlSeconds: 60,
      advanceTime,
    });
    expect(failed).toEqual([]);
  });

  test("fail the same store when it declares no floor", async () => {
    const failed = await failingCases(kvContractCases, {
      connect: () => withTtlFloor(60),
      advanceTime,
    });
    expect(failed).toContain("an expirationTtl of 5s expires on time");
  });
});
