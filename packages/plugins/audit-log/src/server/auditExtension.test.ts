// Public `ctx.audit.log()` API tests. A fake service captures what
// `service.record` receives without writing to the DB.

import type {
  AuthenticatedAppContext,
  AuthenticatedUser,
  DeferFn,
  HookOptions,
  PluginSetupContext,
} from "plumix/plugin";
import type { Entry } from "plumix/schema";
import { authenticated, base, definePlugin, HookRegistry } from "plumix/plugin";
import {
  createDeferQueue,
  createDispatcherHarness,
  createTestContext,
  plumixRequest,
} from "plumix/test";
import { beforeAll, describe, expect, expectTypeOf, test } from "vitest";

import type { NewAuditLogRow } from "../db/schema.js";
import type { TestDb } from "../test-support.js";
import type { AuditLogStorage } from "../types.js";
import type { AuditExtension } from "./auditExtension.js";
import type { AuditService } from "./auditService.js";
import { auditLog } from "../index.js";
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
}

function fakeService(): FakeServiceState {
  const rows: NewAuditLogRow[] = [];
  return {
    rows,
    service: {
      record: (_ctx, row) => {
        rows.push(row);
      },
    },
  };
}

function makeCtx(
  user: AuthenticatedUser,
  defer?: DeferFn,
): AuthenticatedAppContext {
  return { ...createTestContext({ db, user, defer }), user };
}

const adminUser: AuthenticatedUser = {
  id: 7,
  email: "alice@example.com",
  role: "admin",
  meta: {},
};

describe("createAuditExtension", () => {
  test("logs a row attributed to ctx.user", () => {
    const state = fakeService();
    const audit = createAuditExtension(state.service);
    const ctx = makeCtx(adminUser);
    audit.log(ctx, {
      event: "comment:approved",
      subject: { type: "comment", id: 42, label: "First post!" },
      properties: { approvedBy: "moderator" },
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
    const ctx = makeCtx(adminUser);
    const result: unknown = audit.log(ctx, {
      event: "x:y",
      subject: { type: "x", id: 1, label: "x" },
    });
    expect(result).toBeUndefined();
  });

  test("only a signed-in context is accepted — no anonymous rows, by type", () => {
    expectTypeOf<AuditExtension["log"]>()
      .parameter(0)
      .toEqualTypeOf<AuthenticatedAppContext>();
  });

  test("multiple log() calls in one request all land on the same service buffer", () => {
    const state = fakeService();
    const audit = createAuditExtension(state.service);
    const ctx = makeCtx(adminUser);
    audit.log(ctx, { event: "a:1", subject: { type: "a", id: 1, label: "1" } });
    audit.log(ctx, { event: "a:2", subject: { type: "a", id: 2, label: "2" } });
    audit.log(ctx, { event: "a:3", subject: { type: "a", id: 3, label: "3" } });
    expect(state.rows.map((r) => r.event)).toEqual(["a:1", "a:2", "a:3"]);
  });

  test("missing subject.label falls back to '(unnamed)'", () => {
    const state = fakeService();
    const audit = createAuditExtension(state.service);
    const ctx = makeCtx(adminUser);
    audit.log(ctx, {
      event: "x:y",
      subject: { type: "x", id: 1 },
    });
    expect(state.rows[0]?.subjectLabel).toBe("(unnamed)");
  });

  test("subject.id is stringified — accepts numbers AND strings", () => {
    const state = fakeService();
    const audit = createAuditExtension(state.service);
    const ctx = makeCtx(adminUser);
    audit.log(ctx, {
      event: "x:y",
      subject: { type: "x", id: 99, label: "n" },
    });
    audit.log(ctx, {
      event: "x:y",
      subject: { type: "x", id: "uuid-1", label: "s" },
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

function realServiceCtx(user: AuthenticatedUser): {
  ctx: AuthenticatedAppContext;
  flush: () => Promise<void>;
} {
  const { defer, drainDeferred } = createDeferQueue();
  return { ctx: makeCtx(user, defer), flush: drainDeferred };
}

describe("createAuditExtension — integration with the real AuditService", () => {
  test("multiple log() calls in one request batch into a single storage.write", async () => {
    const { storage, capture } = captureStorage();
    const service = createAuditService(storage);
    const audit = createAuditExtension(service);
    const { ctx, flush } = realServiceCtx(adminUser);

    audit.log(ctx, { event: "a:1", subject: { type: "a", id: 1, label: "1" } });
    audit.log(ctx, { event: "a:2", subject: { type: "a", id: 2, label: "2" } });
    audit.log(ctx, { event: "a:3", subject: { type: "a", id: 3, label: "3" } });
    await flush();

    expect(capture.writes).toHaveLength(1);
    expect(capture.writes[0]).toHaveLength(3);
  });

  test("public log() + internal entry hook route to the same service — both rows land", async () => {
    // Batching is a microtask window, so an intervening `await` may flush more
    // than once, but neither call sets up a separate buffer.
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

    audit.log(ctx, {
      event: "comment:approved",
      subject: { type: "comment", id: 5, label: "first" },
    });
    await hooks.doAction(
      "entry:published",
      {
        id: 99,
        title: "Hello",
        slug: "hello",
        type: "post",
        status: "published",
      } as unknown as Entry,
      ctx,
    );
    await flush();

    const allRows = capture.writes.flat();
    expect(allRows.map((r) => r.event).sort()).toEqual([
      "comment:approved",
      "entry:published",
    ]);
  });

  test("public log() + internal hook fired in the same sync tick batch into one flush", async () => {
    // Proves the public API joins the same microtask window as internal calls
    // when fired without an intervening await.
    const { storage, capture } = captureStorage();
    const service = createAuditService(storage);
    const audit = createAuditExtension(service);

    const { ctx, flush } = realServiceCtx(adminUser);
    audit.log(ctx, { event: "x:1", subject: { type: "x", id: 1, label: "1" } });
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
    await flush();

    expect(capture.writes).toHaveLength(1);
    expect(capture.writes[0]).toHaveLength(2);
  });
});

// The ambient context is built before sign-in and an authenticated procedure
// works on a copy, so the session rides a cookie, not a pre-signed context.
describe("createAuditExtension — through an authenticated procedure", () => {
  test("a row logged by a plugin's procedure is attributed to the signed-in user", async () => {
    const { storage, capture } = captureStorage();
    const probe = definePlugin("probe", {
      setup: (ctx) => {
        ctx.registerRpcRouter({
          touch: base.use(authenticated).handler(({ context }) => {
            context.audit?.log(context, {
              event: "widget:touched",
              subject: { type: "widget", id: 3, label: "Gizmo" },
            });
            return null;
          }),
        });
      },
    });
    const h = await createDispatcherHarness({
      config: { plugins: [auditLog({ storage }), probe] },
    });
    const admin = await h.factory.user.create({ role: "admin" });
    const request = await h.authenticateRequest(
      plumixRequest("/_plumix/rpc/probe/touch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: null }),
      }),
      admin.id,
    );

    const response = await h.dispatch(request);
    await h.drainDeferred();

    expect(response.status).toBe(200);
    expect(capture.writes.flat()).toEqual([
      expect.objectContaining({
        event: "widget:touched",
        subjectType: "widget",
        subjectId: "3",
        subjectLabel: "Gizmo",
        actorId: admin.id,
        actorLabel: admin.email,
      }),
    ]);
  });
});
