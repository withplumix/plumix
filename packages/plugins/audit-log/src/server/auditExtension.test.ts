// Public `ctx.audit.log()` API tests. A fake service under
// requestStore.run covers the full chokepoint (ctx resolve → actor
// gate → service.record) without writing to the DB.

import type {
  AppContext,
  AuthenticatedUser,
  HookOptions,
  Logger,
  PluginSetupContext,
} from "plumix/plugin";
import type { Entry } from "plumix/schema";
import type { Mock } from "vitest";
import { HookRegistry, requestStore } from "plumix/plugin";
import { createDeferQueue, createTestContext } from "plumix/test";
import { beforeAll, describe, expect, test, vi } from "vitest";

import type { NewAuditLogRow } from "../db/schema.js";
import type { TestDb } from "../test-support.js";
import type { AuditLogStorage } from "../types.js";
import type { AuditService } from "./auditService.js";
import { createDb } from "../test-support.js";
import { registerAuditEvents } from "./auditEvents.js";
import { createAuditExtension } from "./auditExtension.js";
import { createAuditService } from "./auditService.js";

let db: TestDb;

beforeAll(async () => {
  db = await createDb();
});

interface FakeServiceState {
  readonly service: AuditService;
  readonly rows: NewAuditLogRow[];
  warnedNoContext: number;
}

function fakeService(): FakeServiceState {
  const rows: NewAuditLogRow[] = [];
  const state: FakeServiceState = {
    rows,
    warnedNoContext: 0,
    service: {
      record: (_ctx, row) => {
        rows.push(row);
      },
      warnNoContextOnce: () => {
        state.warnedNoContext += 1;
      },
    },
  };
  return state;
}

function makeCtx(user: AuthenticatedUser | null): {
  ctx: AppContext;
  debug: Mock<Logger["debug"]>;
} {
  const debug = vi.fn<Logger["debug"]>();
  const logger: Logger = {
    debug,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  return { ctx: createTestContext({ db, user, logger }), debug };
}

const adminUser: AuthenticatedUser = {
  id: 7,
  email: "alice@example.com",
  role: "admin",
  meta: {},
};

describe("createAuditExtension", () => {
  test("logs a row when ctx.user is set", () => {
    const state = fakeService();
    const audit = createAuditExtension(state.service);
    requestStore.run(makeCtx(adminUser).ctx, () => {
      audit.log({
        event: "comment:approved",
        subject: { type: "comment", id: 42, label: "First post!" },
        properties: { approvedBy: "moderator" },
      });
    });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({
      event: "comment:approved",
      subjectType: "comment",
      subjectId: "42",
      subjectLabel: "First post!",
      actorId: 7,
      actorLabel: "alice@example.com",
      properties: { approvedBy: "moderator" },
    });
  });

  test("returns void synchronously — caller cannot await the storage write", () => {
    const state = fakeService();
    const audit = createAuditExtension(state.service);
    let result: unknown;
    requestStore.run(makeCtx(adminUser).ctx, () => {
      result = audit.log({
        event: "x:y",
        subject: { type: "x", id: 1, label: "x" },
      });
    });
    expect(result).toBeUndefined();
  });

  test("drops the call when ctx.user is null + debug-logs", () => {
    const state = fakeService();
    const audit = createAuditExtension(state.service);
    const { ctx, debug } = makeCtx(null);
    requestStore.run(ctx, () => {
      audit.log({
        event: "comment:approved",
        subject: { type: "comment", id: 42, label: "x" },
      });
    });
    expect(state.rows).toHaveLength(0);
    expect(debug).toHaveBeenCalledTimes(1);
    const call = debug.mock.calls[0]?.[0];
    expect(call).toMatch(/no user|no actor|dropped/i);
  });

  test("drops the call when fired outside requestStore — no buffer key to write to", () => {
    const state = fakeService();
    const audit = createAuditExtension(state.service);
    audit.log({
      event: "x:y",
      subject: { type: "x", id: 1, label: "x" },
    });
    expect(state.rows).toHaveLength(0);
    expect(state.warnedNoContext).toBe(0);
  });

  test("multiple log() calls in one request all land on the same service buffer", () => {
    const state = fakeService();
    const audit = createAuditExtension(state.service);
    requestStore.run(makeCtx(adminUser).ctx, () => {
      audit.log({ event: "a:1", subject: { type: "a", id: 1, label: "1" } });
      audit.log({ event: "a:2", subject: { type: "a", id: 2, label: "2" } });
      audit.log({ event: "a:3", subject: { type: "a", id: 3, label: "3" } });
    });
    expect(state.rows.map((r) => r.event)).toEqual(["a:1", "a:2", "a:3"]);
  });

  test("missing subject.label falls back to '(unnamed)'", () => {
    const state = fakeService();
    const audit = createAuditExtension(state.service);
    requestStore.run(makeCtx(adminUser).ctx, () => {
      audit.log({
        event: "x:y",
        subject: { type: "x", id: 1 },
      });
    });
    expect(state.rows[0]?.subjectLabel).toBe("(unnamed)");
  });

  test("subject.id is stringified — accepts numbers AND strings", () => {
    const state = fakeService();
    const audit = createAuditExtension(state.service);
    requestStore.run(makeCtx(adminUser).ctx, () => {
      audit.log({
        event: "x:y",
        subject: { type: "x", id: 99, label: "n" },
      });
      audit.log({
        event: "x:y",
        subject: { type: "x", id: "uuid-1", label: "s" },
      });
    });
    expect(state.rows.map((r) => r.subjectId)).toEqual(["99", "uuid-1"]);
  });
});

// ──────────────────────────────────────────────────────────────────
// Integration: public log() + internal hooks share the single per-
// request flush from the real AuditService. Use a fake storage so we
// can count `storage.write` invocations end-to-end.
// ──────────────────────────────────────────────────────────────────

interface CapturedFlush {
  readonly writes: NewAuditLogRow[][];
}

function captureStorage(): {
  storage: AuditLogStorage;
  capture: CapturedFlush;
} {
  const writes: NewAuditLogRow[][] = [];
  return {
    capture: { writes },
    storage: {
      kind: "capture",
      write: (_ctx, rows) => {
        writes.push([...rows]);
        return Promise.resolve();
      },
      query: () => Promise.resolve({ rows: [], nextCursor: null }),
    },
  };
}

function realServiceCtx(user: AuthenticatedUser | null): {
  ctx: AppContext;
  flush: () => Promise<void>;
} {
  const { defer, drainDeferred } = createDeferQueue();
  return {
    ctx: createTestContext({ db, user, defer }),
    flush: drainDeferred,
  };
}

describe("createAuditExtension — integration with the real AuditService", () => {
  test("multiple log() calls in one request batch into a single storage.write", async () => {
    const { storage, capture } = captureStorage();
    const service = createAuditService(storage);
    const audit = createAuditExtension(service);
    const { ctx, flush } = realServiceCtx(adminUser);

    requestStore.run(ctx, () => {
      audit.log({ event: "a:1", subject: { type: "a", id: 1, label: "1" } });
      audit.log({ event: "a:2", subject: { type: "a", id: 2, label: "2" } });
      audit.log({ event: "a:3", subject: { type: "a", id: 3, label: "3" } });
    });
    await flush();

    expect(capture.writes).toHaveLength(1);
    expect(capture.writes[0]).toHaveLength(3);
  });

  test("public log() + internal entry hook route to the same service — both rows land", async () => {
    // Pins the "share the same buffer / no double-write" criterion: a
    // third-party plugin's ctx.audit.log() and a core entry-hook
    // capture in the same request route through the same AuditService
    // instance and both rows reach storage. (The synchronous batching
    // window is a microtask — see auditService.ts:48-54 — so an
    // intervening `await` may produce multiple flushes, but neither
    // call sets up a separate buffer.)
    const { storage, capture } = captureStorage();
    const service = createAuditService(storage);
    const audit = createAuditExtension(service);
    const hooks = new HookRegistry();
    const setupCtx = {
      addAction: (
        name: string,
        fn: (...args: unknown[]) => unknown,
        options?: HookOptions,
      ) => {
        hooks.addAction(name as never, fn as never, options);
      },
    } as unknown as PluginSetupContext;
    registerAuditEvents(setupCtx, service);

    const { ctx, flush } = realServiceCtx(adminUser);

    await requestStore.run(ctx, async () => {
      audit.log({
        event: "comment:approved",
        subject: { type: "comment", id: 5, label: "first" },
      });
      await hooks.doAction("entry:published", {
        id: 99,
        title: "Hello",
        slug: "hello",
        type: "post",
        status: "published",
      } as unknown as Entry);
    });
    await flush();

    const allRows = capture.writes.flat();
    expect(allRows.map((r) => r.event).sort()).toEqual([
      "comment:approved",
      "entry:published",
    ]);
  });

  test("public log() + internal hook fired in the same sync tick batch into one flush", async () => {
    // Synchronous siblings within the microtask window collapse into a
    // single storage.write — matches the existing service-test
    // guarantee for multiple internal calls and proves the public API
    // joins that same window when fired without an intervening await.
    const { storage, capture } = captureStorage();
    const service = createAuditService(storage);
    const audit = createAuditExtension(service);

    const { ctx, flush } = realServiceCtx(adminUser);
    requestStore.run(ctx, () => {
      audit.log({ event: "x:1", subject: { type: "x", id: 1, label: "1" } });
      // Direct service.record mirrors what an internal hook listener
      // does — no await between, so the buffer is still alive.
      service.record(ctx, {
        event: "entry:published",
        subjectType: "entry",
        subjectId: "99",
        subjectLabel: "Hello",
        actorId: 7,
        actorLabel: "alice@example.com",
        properties: {},
      });
    });
    await flush();

    expect(capture.writes).toHaveLength(1);
    expect(capture.writes[0]).toHaveLength(2);
  });
});
