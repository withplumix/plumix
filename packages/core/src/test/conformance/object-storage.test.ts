import { describe, expect, test } from "vitest";

import type {
  ConnectedObjectStorage,
  GetOptions,
} from "../../runtime/slots.js";
import { memoryStorage } from "../../runtime/memory-storage.js";
import { failingCases } from "./case.js";
import { objectStorageContractCases } from "./object-storage.js";

// `memoryStorage` passing the suite is asserted by its own test file; here the
// same cases run against buckets broken the way a real adapter ships broken.

/** A bucket whose `list` treats `limit` as advice — the page overruns. */
function ignoresLimit(): ConnectedObjectStorage {
  const inner = memoryStorage().connect({});
  return {
    ...inner,
    list: (prefix, opts) => inner.list(prefix, { ...opts, limit: 1000 }),
  };
}

/** A bucket whose `get` drops the range and hands back the whole object. */
function ignoresRange(): ConnectedObjectStorage {
  const inner = memoryStorage().connect({});
  return { ...inner, get: (key) => inner.get(key) };
}

// Spelled out rather than a rest-destructure that omits `presignPut`:
// pulling a method off the object by name is what the unbound-method rule
// exists to stop.
function withoutPresign(): ConnectedObjectStorage {
  const inner = memoryStorage().connect({});
  return {
    put: (key, body, opts) => inner.put(key, body, opts),
    get: (key, opts?: GetOptions) => inner.get(key, opts),
    head: (key) => inner.head(key),
    delete: (key) => inner.delete(key),
    list: (prefix, opts) => inner.list(prefix, opts),
    url: (key, opts) => inner.url(key, opts),
  };
}

describe("object storage contract cases", () => {
  test("fail a bucket whose list ignores limit", async () => {
    const failed = await failingCases(objectStorageContractCases, {
      connect: ignoresLimit,
      publicUrls: true,
      presign: true,
    });
    expect(failed).toContain("limit is honoured as an upper bound on the page");
  });

  test("fail a bucket whose get ignores the range", async () => {
    const failed = await failingCases(objectStorageContractCases, {
      connect: ignoresRange,
      publicUrls: true,
      presign: true,
    });
    expect(failed).toContain("a range read returns just the requested window");
  });

  test("never ask a bucket that declares no presign to mint one", async () => {
    const failed = await failingCases(objectStorageContractCases, {
      connect: withoutPresign,
      publicUrls: true,
    });
    expect(failed).toEqual([]);
  });
});
