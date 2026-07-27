import { describe, expect, test } from "vitest";

import type { TelemetrySpan } from "../context/telemetry.js";
import type { DebugHistoryEntry } from "./history.js";
import { createDebugHistoryStore } from "./history.js";
import { makeSnapshot } from "./snapshot-fixture.js";

function entry(overrides: Partial<DebugHistoryEntry> = {}): DebugHistoryEntry {
  return {
    id: "req-1",
    startedAt: 1_000,
    status: 200,
    durationMs: 5,
    snapshot: makeSnapshot(),
    ...overrides,
  };
}

describe("createDebugHistoryStore — ring buffer", () => {
  test("never exceeds N and drops the oldest on insert", () => {
    const store = createDebugHistoryStore({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      store.save(entry({ id: `req-${i}` }));
    }

    const ids = store.get().map((e) => e.id);
    // Newest-first, capped at 3, the two oldest evicted.
    expect(ids).toEqual(["req-4", "req-3", "req-2"]);
  });

  test("get() returns entries newest-first", () => {
    const store = createDebugHistoryStore();
    store.save(entry({ id: "a" }));
    store.save(entry({ id: "b" }));
    store.save(entry({ id: "c" }));

    expect(store.get().map((e) => e.id)).toEqual(["c", "b", "a"]);
  });

  test("find() returns the entry by id, or undefined when absent", () => {
    const store = createDebugHistoryStore();
    store.save(entry({ id: "a", status: 201 }));

    expect(store.find("a")?.status).toBe(201);
    expect(store.find("missing")).toBeUndefined();
  });

  test("find() no longer resolves an evicted id", () => {
    const store = createDebugHistoryStore({ maxEntries: 1 });
    store.save(entry({ id: "old" }));
    store.save(entry({ id: "new" }));

    expect(store.find("old")).toBeUndefined();
    expect(store.find("new")).toBeDefined();
  });
});

describe("createDebugHistoryStore — detachment", () => {
  test("mutating the source snapshot after save does not change the stored copy", () => {
    const store = createDebugHistoryStore();
    const span: TelemetrySpan = {
      name: "dispatch",
      startedAt: 0,
      durationMs: 1,
      status: "ok",
      attributes: { note: "before" },
      children: [],
    };
    const source = makeSnapshot({ spans: [span] });

    store.save(entry({ snapshot: source }));

    // Mutate every level of the source after the save.
    span.attributes.note = "after";
    span.children.push(span);
    (source.records as Record<string, unknown>).injected = [{ at: 1, data: 1 }];

    const stored = store.find("req-1");
    expect(stored?.snapshot.spans[0]?.attributes.note).toBe("before");
    expect(stored?.snapshot.spans[0]?.children).toEqual([]);
    expect(stored?.snapshot.records.injected).toBeUndefined();
  });

  test("drops non-JSON values (functions) and survives circular references", () => {
    const store = createDebugHistoryStore();
    const circular: Record<string, unknown> = { self: null };
    circular.self = circular;
    const records = {
      panel: [
        {
          at: 1,
          data: { keep: "yes", fn: () => "drop", loop: circular },
        },
      ],
    };

    expect(() =>
      store.save(entry({ snapshot: makeSnapshot({ records }) })),
    ).not.toThrow();

    const data = store.find("req-1")?.snapshot.records.panel?.[0]?.data as {
      keep: string;
      fn?: unknown;
      loop: { self: unknown };
    };
    expect(data.keep).toBe("yes");
    expect(data.fn).toBeUndefined();
    expect(data.loop.self).toBe("[Circular]");
  });

  test("serializes a Date via toJSON, matching JSON.stringify (not {})", () => {
    const store = createDebugHistoryStore();
    const at = new Date("2026-07-27T00:00:00.000Z");
    const records = { panel: [{ at: 1, data: { when: at } }] };

    store.save(entry({ snapshot: makeSnapshot({ records }) }));

    const data = store.find("req-1")?.snapshot.records.panel?.[0]?.data as {
      when: string;
    };
    expect(data.when).toBe("2026-07-27T00:00:00.000Z");
  });
});

describe("createDebugHistoryStore — payload bounding", () => {
  test("truncates oversized attribute strings", () => {
    const store = createDebugHistoryStore({ maxStringLength: 10 });
    const span: TelemetrySpan = {
      name: "db:query",
      startedAt: 0,
      durationMs: 1,
      status: "ok",
      attributes: { sql: "x".repeat(1_000) },
      children: [],
    };

    store.save(entry({ snapshot: makeSnapshot({ spans: [span] }) }));

    const sql = store.find("req-1")?.snapshot.spans[0]?.attributes
      .sql as string;
    expect(sql.length).toBeLessThan(50);
    expect(sql).toMatch(/truncated/);
  });

  test("evicts oldest past the total byte budget but always keeps the newest", () => {
    // A single big snapshot dwarfs the budget; the newest must survive alone.
    const big = "y".repeat(5_000);
    const store = createDebugHistoryStore({
      maxEntries: 10,
      maxTotalBytes: 2_000,
      maxStringLength: 10_000,
    });

    store.save(entry({ id: "a", snapshot: bigSnapshot(big) }));
    store.save(entry({ id: "b", snapshot: bigSnapshot(big) }));

    const ids = store.get().map((e) => e.id);
    expect(ids).toEqual(["b"]);
  });
});

function bigSnapshot(text: string) {
  const span: TelemetrySpan = {
    name: "db:query",
    startedAt: 0,
    durationMs: 1,
    status: "ok",
    attributes: { sql: text },
    children: [],
  };
  return makeSnapshot({ spans: [span] });
}
