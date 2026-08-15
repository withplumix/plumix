import { afterEach, describe, expect, test, vi } from "vitest";

import { memoryKv } from "./memory-kv.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("memoryKv", () => {
  test("put then get returns the stored value", async () => {
    const kv = memoryKv().connect({});
    await kv.put("k", "v");
    expect(await kv.get("k")).toBe("v");
  });

  test("get returns null for a missing key", async () => {
    const kv = memoryKv().connect({});
    expect(await kv.get("missing")).toBeNull();
  });

  test("put overwrites an existing value", async () => {
    const kv = memoryKv().connect({});
    await kv.put("k", "1");
    await kv.put("k", "2");
    expect(await kv.get("k")).toBe("2");
  });

  test("delete removes a key", async () => {
    const kv = memoryKv().connect({});
    await kv.put("k", "v");
    await kv.delete("k");
    expect(await kv.get("k")).toBeNull();
  });

  test("seed pre-populates entries", async () => {
    const kv = memoryKv({ seed: { a: "1", b: "2" } }).connect({});
    expect(await kv.get("a")).toBe("1");
    expect(await kv.get("b")).toBe("2");
  });

  test("expirationTtl expires the entry after its window", async () => {
    vi.useFakeTimers();
    const kv = memoryKv().connect({});
    await kv.put("k", "v", { expirationTtl: 60 });
    expect(await kv.get("k")).toBe("v");
    vi.advanceTimersByTime(61_000);
    expect(await kv.get("k")).toBeNull();
  });

  test("put rejects a sub-60-second expirationTtl, mirroring the platform", async () => {
    const kv = memoryKv().connect({});
    await expect(kv.put("k", "v", { expirationTtl: 30 })).rejects.toThrow(
      /at least 60/,
    );
  });

  test("put without a ttl clears a previously set expiry", async () => {
    vi.useFakeTimers();
    const kv = memoryKv().connect({});
    await kv.put("k", "v", { expirationTtl: 60 });
    await kv.put("k", "v2");
    vi.advanceTimersByTime(120_000);
    expect(await kv.get("k")).toBe("v2");
  });

  describe("list", () => {
    test("returns all keys sorted with listComplete when exhausted", async () => {
      const kv = memoryKv({ seed: { b: "2", a: "1", c: "3" } }).connect({});
      const result = await kv.list();
      expect(result.keys).toEqual(["a", "b", "c"]);
      expect(result.listComplete).toBe(true);
      expect(result.cursor).toBeUndefined();
    });

    test("prefix filters the keys", async () => {
      const kv = memoryKv({
        seed: { "u:1": "a", "u:2": "b", "x:1": "c" },
      }).connect({});
      const result = await kv.list({ prefix: "u:" });
      expect(result.keys).toEqual(["u:1", "u:2"]);
    });

    test("limit paginates through an opaque cursor", async () => {
      const kv = memoryKv({ seed: { a: "1", b: "2", c: "3" } }).connect({});
      const first = await kv.list({ limit: 2 });
      expect(first.keys).toEqual(["a", "b"]);
      expect(first.listComplete).toBe(false);
      expect(first.cursor).toBeDefined();

      const second = await kv.list({ limit: 2, cursor: first.cursor });
      expect(second.keys).toEqual(["c"]);
      expect(second.listComplete).toBe(true);
      expect(second.cursor).toBeUndefined();
    });

    test("prefix and cursor combine across pages", async () => {
      const kv = memoryKv({
        seed: { "u:1": "a", "u:2": "b", "u:3": "c", "x:1": "d" },
      }).connect({});
      const first = await kv.list({ prefix: "u:", limit: 2 });
      expect(first.keys).toEqual(["u:1", "u:2"]);
      expect(first.listComplete).toBe(false);

      const second = await kv.list({
        prefix: "u:",
        limit: 2,
        cursor: first.cursor,
      });
      expect(second.keys).toEqual(["u:3"]);
      expect(second.listComplete).toBe(true);
    });

    test("omits expired entries", async () => {
      vi.useFakeTimers();
      const kv = memoryKv().connect({});
      await kv.put("keep", "1");
      await kv.put("gone", "2", { expirationTtl: 60 });
      vi.advanceTimersByTime(61_000);
      const result = await kv.list();
      expect(result.keys).toEqual(["keep"]);
    });
  });
});
