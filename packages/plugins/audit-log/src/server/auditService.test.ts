import { describe, expect, test, vi } from "vitest";

import type { AppContext } from "@plumix/core";

import type { NewAuditLogRow } from "../db/schema.js";
import type { AuditLogStorage } from "../types.js";
import { createAuditService } from "./auditService.js";

interface FakeCtx {
  readonly logger: {
    debug: () => void;
    info: () => void;
    warn: ReturnType<typeof vi.fn>;
    error: () => void;
  };
  defer: ReturnType<typeof vi.fn>;
}

function fakeCtx(): FakeCtx {
  return {
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: vi.fn(),
      error: () => undefined,
    },
    defer: vi.fn(),
  };
}

function fakeStorage(): {
  storage: AuditLogStorage;
  writes: NewAuditLogRow[][];
} {
  const writes: NewAuditLogRow[][] = [];
  return {
    storage: {
      kind: "fake",
      write: (_ctx, rows) => {
        writes.push([...rows]);
        return Promise.resolve();
      },
      query: () => Promise.resolve({ rows: [], nextCursor: null }),
    },
    writes,
  };
}

const sampleRow: NewAuditLogRow = {
  event: "entry:updated",
  subjectType: "entry",
  subjectId: "1",
  subjectLabel: "Hello",
  actorId: 1,
  actorLabel: "alice@example.com",
  properties: {},
};

describe("createAuditService", () => {
  test("first record schedules defer once; subsequent records append to the same buffer", async () => {
    const ctx = fakeCtx();
    const { storage, writes } = fakeStorage();
    const service = createAuditService(storage);

    service.record(ctx as unknown as AppContext, sampleRow);
    service.record(ctx as unknown as AppContext, sampleRow);
    service.record(ctx as unknown as AppContext, sampleRow);

    expect(ctx.defer).toHaveBeenCalledTimes(1);

    // Drain the deferred flush.
    await ctx.defer.mock.calls[0]?.[0];

    expect(writes).toHaveLength(1);
    expect(writes[0]).toHaveLength(3);
  });

  test("each AppContext gets its own buffer (no cross-request leak)", async () => {
    const ctxA = fakeCtx();
    const ctxB = fakeCtx();
    const { storage, writes } = fakeStorage();
    const service = createAuditService(storage);

    service.record(ctxA as unknown as AppContext, sampleRow);
    service.record(ctxB as unknown as AppContext, sampleRow);
    service.record(ctxA as unknown as AppContext, sampleRow);

    await Promise.all([
      ctxA.defer.mock.calls[0]?.[0],
      ctxB.defer.mock.calls[0]?.[0],
    ]);

    // 2 writes — one per ctx. ctxA has 2 rows, ctxB has 1.
    expect(writes).toHaveLength(2);
    const counts = writes.map((w) => w.length).sort();
    expect(counts).toEqual([1, 2]);
  });

  test("storage.write failure logs a warning and does not throw to the caller", async () => {
    const ctx = fakeCtx();
    const failingStorage: AuditLogStorage = {
      kind: "fake",
      write: () => Promise.reject(new Error("disk full")),
      query: () => Promise.resolve({ rows: [], nextCursor: null }),
    };
    const service = createAuditService(failingStorage);

    service.record(ctx as unknown as AppContext, sampleRow);

    // The deferred flush captures the rejection internally.
    await ctx.defer.mock.calls[0]?.[0];

    expect(ctx.logger.warn).toHaveBeenCalled();
    const calls = ctx.logger.warn.mock.calls.flat().map(String);
    expect(calls.some((c) => c.includes("storage.write failed"))).toBe(true);
  });

  test("a record() after the previous flush has run schedules a fresh defer (no orphan rows)", async () => {
    // Race regression: previously `flush` spliced the buffer empty,
    // but the buffer object stayed in the WeakMap. A subsequent
    // record() found the (empty) array, pushed onto it, and returned
    // without scheduling — the row was orphaned until ctx GC'd it.
    const ctx = fakeCtx();
    const { storage, writes } = fakeStorage();
    const service = createAuditService(storage);

    service.record(ctx as unknown as AppContext, sampleRow);
    await ctx.defer.mock.calls[0]?.[0];
    expect(writes).toHaveLength(1);

    // Second record after the first flush completed must schedule a
    // brand-new defer; otherwise the row never lands in storage.
    service.record(ctx as unknown as AppContext, sampleRow);
    expect(ctx.defer).toHaveBeenCalledTimes(2);
    await ctx.defer.mock.calls[1]?.[0];
    expect(writes).toHaveLength(2);
  });

  test("warnNoContextOnce only logs the first time, no matter how many hook drops fire", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      // swallow — assertion checks call count below
    });
    try {
      const { storage } = fakeStorage();
      const service = createAuditService(storage);
      service.warnNoContextOnce();
      service.warnNoContextOnce();
      service.warnNoContextOnce();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const [first] = consoleWarnSpy.mock.calls;
      expect(first?.[0]).toContain("requestStore");
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  test("a row whose properties exceed 256 KiB is dropped with a warning, not written", () => {
    const ctx = fakeCtx();
    const { storage, writes } = fakeStorage();
    const service = createAuditService(storage);

    // Build an oversized properties envelope deliberately.
    const huge = "x".repeat(300_000);
    const oversized: NewAuditLogRow = {
      ...sampleRow,
      properties: { diff: { content: ["", huge] } },
    };

    service.record(ctx as unknown as AppContext, oversized);

    // Defer was never scheduled — record() short-circuited.
    expect(ctx.defer).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(ctx.logger.warn).toHaveBeenCalled();
    const calls = ctx.logger.warn.mock.calls.flat().map(String);
    expect(calls.some((c) => c.toLowerCase().includes("exceed"))).toBe(true);
  });

  test("a row whose properties contain a non-serializable value (BigInt) is dropped with a warning", () => {
    const ctx = fakeCtx();
    const { storage, writes } = fakeStorage();
    const service = createAuditService(storage);

    const unserializable: NewAuditLogRow = {
      ...sampleRow,
      properties: { weight: 42n as unknown as number },
    };

    service.record(ctx as unknown as AppContext, unserializable);

    expect(ctx.defer).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(ctx.logger.warn).toHaveBeenCalled();
    const calls = ctx.logger.warn.mock.calls.flat().map(String);
    expect(calls.some((c) => c.toLowerCase().includes("serializable"))).toBe(
      true,
    );
  });

  test("a defer that throws synchronously is caught and warn-logged", () => {
    const ctx = fakeCtx();
    ctx.defer.mockImplementation(() => {
      throw new Error("runtime missing defer shim");
    });
    const { storage } = fakeStorage();
    const service = createAuditService(storage);

    expect(() =>
      service.record(ctx as unknown as AppContext, sampleRow),
    ).not.toThrow();

    expect(ctx.logger.warn).toHaveBeenCalled();
    const calls = ctx.logger.warn.mock.calls.flat().map(String);
    expect(calls.some((c) => c.includes("failed to schedule"))).toBe(true);
  });
});
