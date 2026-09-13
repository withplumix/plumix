import type { AppContext, Logger } from "plumix/plugin";
import type { Mock } from "vitest";
import { createTestContext } from "plumix/test";
import { beforeAll, describe, expect, test, vi } from "vitest";

import type { NewAuditLogRow } from "../db/schema.js";
import type { TestDb } from "../test-support.js";
import type { AuditLogStorage } from "../types.js";
import { createDb } from "../test-support.js";
import { createAuditService } from "./auditService.js";

let db: TestDb;

beforeAll(async () => {
  db = await createDb();
});

interface FakeCtx {
  readonly ctx: AppContext;
  readonly warn: Mock<Logger["warn"]>;
  readonly defer: Mock<AppContext["defer"]>;
}

function fakeCtx(): FakeCtx {
  const warn = vi.fn<Logger["warn"]>();
  const defer = vi.fn<AppContext["defer"]>();
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn,
    error: () => undefined,
  };
  return { ctx: createTestContext({ db, logger, defer }), warn, defer };
}

function warnMessages(warn: FakeCtx["warn"]): string[] {
  return warn.mock.calls.map(([message]) => message);
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
    const { ctx, defer } = fakeCtx();
    const { storage, writes } = fakeStorage();
    const service = createAuditService(storage);

    service.record(ctx, sampleRow);
    service.record(ctx, sampleRow);
    service.record(ctx, sampleRow);

    expect(defer).toHaveBeenCalledTimes(1);

    // Drain the deferred flush.
    await defer.mock.calls[0]?.[0];

    expect(writes).toHaveLength(1);
    expect(writes[0]).toHaveLength(3);
  });

  test("each AppContext gets its own buffer (no cross-request leak)", async () => {
    const a = fakeCtx();
    const b = fakeCtx();
    const { storage, writes } = fakeStorage();
    const service = createAuditService(storage);

    service.record(a.ctx, sampleRow);
    service.record(b.ctx, sampleRow);
    service.record(a.ctx, sampleRow);

    await Promise.all([a.defer.mock.calls[0]?.[0], b.defer.mock.calls[0]?.[0]]);

    // 2 writes — one per ctx. ctxA has 2 rows, ctxB has 1.
    expect(writes).toHaveLength(2);
    const counts = writes.map((w) => w.length).sort();
    expect(counts).toEqual([1, 2]);
  });

  test("storage.write failure logs a warning and does not throw to the caller", async () => {
    const { ctx, defer, warn } = fakeCtx();
    const failingStorage: AuditLogStorage = {
      kind: "fake",
      write: () => Promise.reject(new Error("disk full")),
      query: () => Promise.resolve({ rows: [], nextCursor: null }),
    };
    const service = createAuditService(failingStorage);

    service.record(ctx, sampleRow);

    // The deferred flush captures the rejection internally.
    await defer.mock.calls[0]?.[0];

    expect(warn).toHaveBeenCalled();
    expect(
      warnMessages(warn).some((c) => c.includes("storage.write failed")),
    ).toBe(true);
  });

  test("a record() after the previous flush has run schedules a fresh defer (no orphan rows)", async () => {
    // Race regression: previously `flush` spliced the buffer empty,
    // but the buffer object stayed in the WeakMap. A subsequent
    // record() found the (empty) array, pushed onto it, and returned
    // without scheduling — the row was orphaned until ctx GC'd it.
    const { ctx, defer } = fakeCtx();
    const { storage, writes } = fakeStorage();
    const service = createAuditService(storage);

    service.record(ctx, sampleRow);
    await defer.mock.calls[0]?.[0];
    expect(writes).toHaveLength(1);

    // Second record after the first flush completed must schedule a
    // brand-new defer; otherwise the row never lands in storage.
    service.record(ctx, sampleRow);
    expect(defer).toHaveBeenCalledTimes(2);
    await defer.mock.calls[1]?.[0];
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
    const { ctx, defer, warn } = fakeCtx();
    const { storage, writes } = fakeStorage();
    const service = createAuditService(storage);

    // Build an oversized properties envelope deliberately.
    const huge = "x".repeat(300_000);
    const oversized: NewAuditLogRow = {
      ...sampleRow,
      properties: { diff: { content: ["", huge] } },
    };

    service.record(ctx, oversized);

    // Defer was never scheduled — record() short-circuited.
    expect(defer).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    expect(
      warnMessages(warn).some((c) => c.toLowerCase().includes("exceed")),
    ).toBe(true);
  });

  test("a row whose properties contain a non-serializable value (BigInt) is dropped with a warning", () => {
    const { ctx, defer, warn } = fakeCtx();
    const { storage, writes } = fakeStorage();
    const service = createAuditService(storage);

    const unserializable: NewAuditLogRow = {
      ...sampleRow,
      properties: { weight: 42n as unknown as number },
    };

    service.record(ctx, unserializable);

    expect(defer).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    expect(
      warnMessages(warn).some((c) => c.toLowerCase().includes("serializable")),
    ).toBe(true);
  });

  test("a defer that throws synchronously is caught and warn-logged", () => {
    const { ctx, defer, warn } = fakeCtx();
    defer.mockImplementation(() => {
      throw new Error("runtime missing defer shim");
    });
    const { storage } = fakeStorage();
    const service = createAuditService(storage);

    expect(() => service.record(ctx, sampleRow)).not.toThrow();

    expect(warn).toHaveBeenCalled();
    expect(
      warnMessages(warn).some((c) => c.includes("failed to schedule")),
    ).toBe(true);
  });
});
