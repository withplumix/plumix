import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { describeKvContract } from "../test/conformance/kv.js";
import { memoryKv } from "./memory-kv.js";

// The suite drives TTL through `advanceTime`, and `memoryKv` reads the wall
// clock, so the whole file runs on fake timers.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describeKvContract({
  connect: () => memoryKv().connect({}),
  advanceTime: (ms) => {
    vi.advanceTimersByTime(ms);
  },
});

describe("memoryKv list", () => {
  // The contract sorts a page before comparing it, so the ordering the
  // in-memory store guarantees has to be asserted here or nowhere.
  test("returns keys in sorted order, not insertion order", async () => {
    const kv = memoryKv({ seed: { b: "2", a: "1", c: "3" } }).connect({});
    expect((await kv.list()).keys).toEqual(["a", "b", "c"]);
  });

  test("fills a page to the limit exactly", async () => {
    const kv = memoryKv({ seed: { a: "1", b: "2", c: "3" } }).connect({});
    const first = await kv.list({ limit: 2 });
    expect(first.keys).toEqual(["a", "b"]);
    const second = await kv.list({ limit: 2, cursor: first.cursor });
    expect(second.keys).toEqual(["c"]);
  });
});

describe("memoryKv seeding", () => {
  test("seeded entries are immediately readable", async () => {
    const kv = memoryKv({ seed: { a: "1", b: "2" } }).connect({});
    expect(await kv.get("a")).toBe("1");
    expect(await kv.get("b")).toBe("2");
  });

  test("seeded entries never expire", async () => {
    const kv = memoryKv({ seed: { a: "1" } }).connect({});
    vi.advanceTimersByTime(86_400_000);
    expect(await kv.get("a")).toBe("1");
  });

  test("seeded entries are listable alongside written ones", async () => {
    const kv = memoryKv({ seed: { a: "1" } }).connect({});
    await kv.put("b", "2");
    expect((await kv.list()).keys).toEqual(["a", "b"]);
  });
});
