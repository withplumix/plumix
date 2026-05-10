// Hook subscription tests. Each test wires a `HookRegistry`, calls
// `registerHooks(ctx, fakeService)`, fires the action via `doAction`
// inside a `requestStore.run` frame, and asserts on the row that
// landed in the fake service's record buffer. Avoids the real DB
// path (slice 178's harness gap) and keeps each assertion pinned to
// the row's shape.

import { describe, expect, test } from "vitest";

import type {
  AppContext,
  AuthenticatedUser,
  HookOptions,
  PluginSetupContext,
  Term,
  User,
} from "@plumix/core";
import { HookRegistry, requestStore } from "@plumix/core";

import type { NewAuditLogRow } from "../db/schema.js";
import type { AuditService } from "./auditService.js";
import { registerHooks } from "./hooks.js";

// Loose-typed dispatch — slice 178's defer.test.ts uses the same
// pattern. The action names here aren't all in `ActionRegistry`'s
// typed view (some are core lifecycle actions), so we cast once to
// keep the tests readable.
type ActionDispatcher = (name: string, ...args: unknown[]) => Promise<void>;

function makeFakeAppCtx(user: AuthenticatedUser | null): AppContext {
  return { user } as AppContext;
}

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

interface HarnessHandles {
  readonly hooks: HookRegistry;
  readonly state: FakeServiceState;
  readonly fire: ActionDispatcher;
  readonly fireOutsideRequest: ActionDispatcher;
}

function harness(user: AuthenticatedUser | null = adminUser): HarnessHandles {
  const hooks = new HookRegistry();
  const state = fakeService();

  // Minimal PluginSetupContext stand-in: only `addAction` is needed
  // by `registerHooks`. Casting through `unknown` lets us satisfy
  // the strict type without conjuring every register* method.
  const ctx = {
    addAction: (
      name: string,
      fn: (...args: unknown[]) => unknown,
      options?: HookOptions,
    ) => {
      hooks.addAction(name as never, fn as never, options);
    },
  } as unknown as PluginSetupContext;
  registerHooks(ctx, state.service);

  const fakeCtx = makeFakeAppCtx(user);
  // Bound so the call sites don't drop `this` — `doAction` reads
  // private state through `this.#actions`.
  const dispatch: ActionDispatcher = (name, ...args) =>
    (hooks.doAction as (n: string, ...a: unknown[]) => Promise<void>).call(
      hooks,
      name,
      ...args,
    );
  return {
    hooks,
    state,
    fire: (name, ...args) =>
      requestStore.run(fakeCtx, () => dispatch(name, ...args)),
    fireOutsideRequest: dispatch,
  };
}

const adminUser: AuthenticatedUser = {
  id: 7,
  email: "alice@example.com",
  role: "admin",
};
const subjectUser = {
  id: 42,
  email: "bob@example.com",
  name: "Bob",
  role: "editor",
  status: "active",
} as unknown as User;

describe("registerHooks — entry surface (regression)", () => {
  test("entry:published produces a row keyed on the entry", async () => {
    const h = harness();
    await h.fire("entry:published", {
      id: 5,
      title: "Hello",
      slug: "hello",
      type: "post",
      status: "published",
    });
    expect(h.state.rows).toHaveLength(1);
    expect(h.state.rows[0]).toMatchObject({
      event: "entry:published",
      subjectType: "entry",
      subjectId: "5",
      subjectLabel: "Hello",
      actorId: 7,
      actorLabel: "alice@example.com",
    });
  });

  test("hook fired outside requestStore lands on warnNoContextOnce, not the service", async () => {
    const h = harness();
    await h.fireOutsideRequest("entry:published", {
      id: 5,
      title: "Hello",
      slug: "hello",
      type: "post",
      status: "published",
    });
    expect(h.state.rows).toHaveLength(0);
    expect(h.state.warnedNoContext).toBe(1);
  });
});

describe("registerHooks — user surface", () => {
  test("user:status_changed encodes the toggle as a [from, to] tuple", async () => {
    const h = harness();
    await h.fire("user:status_changed", subjectUser, { enabled: false });
    expect(h.state.rows[0]).toMatchObject({
      event: "user:status_changed",
      subjectType: "user",
      subjectId: "42",
      subjectLabel: "Bob",
      properties: { status: ["enabled", "disabled"] },
    });
  });

  test("user:updated diffs the top-level user row, ignoring meta + timestamps", async () => {
    const h = harness();
    const previous = {
      ...subjectUser,
      name: "Bobby",
      role: "author",
      meta: { something: "old" },
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    } as unknown as User;
    const next = {
      ...subjectUser,
      meta: { something: "new" },
      updatedAt: new Date("2026-05-10T18:00:00Z"),
    } as unknown as User;
    await h.fire("user:updated", next, previous);

    const row = h.state.rows[0];
    if (!row) throw new Error("expected a captured row");
    expect(row.event).toBe("user:updated");
    const diff = row.properties?.diff as
      | Record<string, [unknown, unknown]>
      | undefined;
    // `name` and `role` differed; `meta` + `updatedAt` are stripped.
    expect(diff).toBeDefined();
    expect(Object.keys(diff ?? {}).sort()).toEqual(["name", "role"]);
    expect(diff?.name).toEqual(["Bobby", "Bob"]);
  });

  test("user:invited attributes to invitedBy with admin email as label, never logs the invite token", async () => {
    const h = harness();
    const expiresAt = new Date("2026-05-17T00:00:00Z");
    await h.fire("user:invited", subjectUser, {
      inviteToken: "secret-do-not-log",
      invitedBy: 7,
      expiresAt,
    });
    const row = h.state.rows[0];
    expect(row?.event).toBe("user:invited");
    expect(row?.actorId).toBe(7);
    expect(row?.actorLabel).toBe("alice@example.com");
    expect(row?.properties).toEqual({
      expiresAt: expiresAt.toISOString(),
    });
    expect(JSON.stringify(row)).not.toContain("secret-do-not-log");
  });

  test("user:invited falls back to id-as-string label when ctx.user is unrelated (e.g. CLI)", async () => {
    const h = harness(null);
    const expiresAt = new Date("2026-05-17T00:00:00Z");
    await h.fire("user:invited", subjectUser, {
      invitedBy: 9,
      expiresAt,
    });
    const row = h.state.rows[0];
    expect(row?.actorId).toBe(9);
    expect(row?.actorLabel).toBe("9");
  });

  test("user:registered self-attributes when ctx.user is null", async () => {
    const h = harness(null);
    await h.fire("user:registered", subjectUser);
    const row = h.state.rows[0];
    expect(row?.event).toBe("user:registered");
    expect(row?.actorId).toBe(42);
    expect(row?.actorLabel).toBe("bob@example.com");
  });
});

describe("registerHooks — auth surface", () => {
  test("user:signed_in self-attributes (ctx.user is null at sign-in time)", async () => {
    const h = harness(null);
    await h.fire("user:signed_in", subjectUser, {
      method: "oauth",
      provider: "github",
      firstSignIn: false,
    });
    expect(h.state.rows[0]).toMatchObject({
      event: "user:signed_in",
      subjectType: "user",
      subjectId: "42",
      actorId: 42,
      actorLabel: "bob@example.com",
      properties: { method: "oauth", provider: "github", firstSignIn: false },
    });
  });

  test("credential:created uses the credential subject + actor from context", async () => {
    const h = harness();
    await h.fire(
      "credential:created",
      {
        id: "cred-1",
        userId: 42,
        name: "My laptop",
        deviceType: "platform",
        isBackedUp: true,
      },
      { actor: adminUser },
    );
    expect(h.state.rows[0]).toMatchObject({
      event: "credential:created",
      subjectType: "credential",
      subjectId: "cred-1",
      subjectLabel: "My laptop",
      actorId: 7,
      actorLabel: "alice@example.com",
      properties: {
        deviceType: "platform",
        isBackedUp: true,
        userId: 42,
      },
    });
  });

  test("api_token:revoked includes the mode (self vs admin) for downstream copy", async () => {
    const h = harness();
    await h.fire(
      "api_token:revoked",
      { id: "tok-9", userId: 42 },
      { actor: adminUser, mode: "admin" },
    );
    expect(h.state.rows[0]?.properties).toMatchObject({
      mode: "admin",
      userId: 42,
    });
  });

  test("device_code:approved labels the row with the userCode", async () => {
    const h = harness();
    await h.fire(
      "device_code:approved",
      {
        id: "dev-9",
        userCode: "ABCD-WXYZ",
        tokenName: "CI deploy",
        scopes: ["entry:read"],
      },
      { actor: adminUser },
    );
    expect(h.state.rows[0]).toMatchObject({
      event: "device_code:approved",
      subjectType: "device_code",
      subjectId: "dev-9",
      subjectLabel: "ABCD-WXYZ",
      properties: { tokenName: "CI deploy", scopes: ["entry:read"] },
    });
  });
});

describe("registerHooks — term surface", () => {
  test("term:updated diffs name/slug/parent (skipping meta + timestamps)", async () => {
    const h = harness();
    const previous = {
      id: 3,
      taxonomy: "category",
      name: "Old",
      slug: "old",
      parentId: null,
      meta: {},
    } as unknown as Term;
    const next = {
      id: 3,
      taxonomy: "category",
      name: "New",
      slug: "new",
      parentId: 9,
      meta: {},
    } as unknown as Term;
    await h.fire("term:updated", next, previous);

    const row = h.state.rows[0];
    if (!row) throw new Error("expected a captured row");
    expect(row.event).toBe("term:updated");
    const diff = row.properties?.diff as
      | Record<string, [unknown, unknown]>
      | undefined;
    expect(diff).toBeDefined();
    expect(Object.keys(diff ?? {}).sort()).toEqual([
      "name",
      "parentId",
      "slug",
    ]);
  });

  test("term:deleted produces a final row even though the source row is gone", async () => {
    const h = harness();
    await h.fire("term:deleted", {
      id: 3,
      taxonomy: "category",
      name: "Old news",
      slug: "old-news",
    });
    expect(h.state.rows[0]).toMatchObject({
      event: "term:deleted",
      subjectType: "term",
      subjectId: "3",
      subjectLabel: "Old news",
    });
  });
});

describe("registerHooks — settings surface", () => {
  test("settings:group_changed records key names only, never raw values", async () => {
    const h = harness();
    await h.fire("settings:group_changed", {
      group: "mailer",
      set: {
        fromAddress: "noreply@example.com",
        smtpPassword: "super-secret-do-not-log",
      },
      removed: ["legacyKey"],
    });
    const row = h.state.rows[0];
    if (!row) throw new Error("expected a captured row");
    expect(row).toMatchObject({
      event: "settings:group_changed",
      subjectType: "settings_group",
      subjectId: "mailer",
      subjectLabel: "mailer",
    });
    expect(row.properties).toEqual({
      keysSet: ["fromAddress", "smtpPassword"],
      keysRemoved: ["legacyKey"],
    });
    // SECURITY: raw values must never land in the audit JSON column.
    expect(JSON.stringify(row)).not.toContain("super-secret-do-not-log");
    expect(JSON.stringify(row)).not.toContain("noreply@example.com");
  });
});
