// Audit-event subscription tests. Each test wires a `HookRegistry`,
// calls `registerAuditEvents(ctx, fakeService)`, fires the action via
// `doAction` inside a `requestStore.run` frame, and asserts on the
// row that landed in the fake service's record buffer. Avoids the
// real DB path and keeps each assertion pinned to the row's shape.
//
// Three layers:
// 1. Existing per-event behavioral coverage (preserved verbatim post-rename).
// 2. Backfill: one assertion per audit-events row so a refactor of the
//    interpreter can't silently break a row that previously had no test.
// 3. Snapshot + guard: a sorted-event-list snapshot catches add/remove
//    drift; `assertRedactionInvariants` ensures sensitive fields stay
//    omitted on every row whose subject type carries them.

import type {
  AppContext,
  AuthenticatedUser,
  HookOptions,
  PluginSetupContext,
  Term,
  User,
} from "plumix/plugin";
import { HookRegistry, requestStore } from "plumix/plugin";
import { describe, expect, test } from "vitest";

import type { NewAuditLogRow } from "../db/schema.js";
import type { AuditEventDef } from "./auditEvents.js";
import type { AuditService } from "./auditService.js";
import {
  assertRedactionInvariants,
  auditEvents,
  registerAuditEvents,
  SUBJECT_REQUIRED_REDACTIONS,
} from "./auditEvents.js";

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
  registerAuditEvents(ctx, state.service);

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

describe("registerAuditEvents — entry surface (regression)", () => {
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

describe("registerAuditEvents — user surface", () => {
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

describe("registerAuditEvents — auth surface", () => {
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

describe("registerAuditEvents — term surface", () => {
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

describe("registerAuditEvents — settings surface", () => {
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

// ──────────────────────────────────────────────────────────────────
// Backfill — one assertion per previously-uncovered audit row
// ──────────────────────────────────────────────────────────────────

const subjectEntry = {
  id: 11,
  title: "Some Post",
  slug: "some-post",
  type: "post",
  status: "draft",
};

describe("registerAuditEvents — entry backfill", () => {
  test("entry:updated diffs top-level columns, ignoring meta/content/timestamps", async () => {
    const h = harness();
    const previous = {
      ...subjectEntry,
      title: "Old Post",
      content: { old: 1 },
      meta: { stale: 1 },
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const next = {
      ...subjectEntry,
      content: { new: 1 },
      meta: { fresh: 1 },
      updatedAt: new Date("2026-05-10T18:00:00Z"),
    };
    await h.fire("entry:updated", next, previous);
    const row = h.state.rows[0];
    expect(row?.event).toBe("entry:updated");
    expect(row?.subjectType).toBe("entry");
    const diff = row?.properties?.diff as
      | Record<string, [unknown, unknown]>
      | undefined;
    expect(Object.keys(diff ?? {}).sort()).toEqual(["title"]);
  });

  test("entry:transition records the from→to status pair", async () => {
    const h = harness();
    await h.fire(
      "entry:transition",
      { ...subjectEntry, status: "published" },
      "draft",
    );
    expect(h.state.rows[0]).toMatchObject({
      event: "entry:transition",
      subjectType: "entry",
      properties: { status: { from: "draft", to: "published" } },
    });
  });

  test("entry:trashed produces a row keyed on the entry", async () => {
    const h = harness();
    await h.fire("entry:trashed", subjectEntry);
    expect(h.state.rows[0]).toMatchObject({
      event: "entry:trashed",
      subjectType: "entry",
      subjectId: "11",
      subjectLabel: "Some Post",
    });
  });

  test("entry:meta_changed records set/removed key names only", async () => {
    const h = harness();
    await h.fire(
      "entry:meta_changed",
      { id: 11, type: "post" },
      { set: { coAuthor: "alice", featured: true }, removed: ["draftNote"] },
    );
    expect(h.state.rows[0]).toMatchObject({
      event: "entry:meta_changed",
      subjectType: "entry",
      subjectId: "11",
      subjectLabel: "Entry #11",
      properties: {
        metaSet: ["coAuthor", "featured"],
        metaRemoved: ["draftNote"],
      },
    });
  });
});

describe("registerAuditEvents — user backfill", () => {
  test("user:deleted carries the reassignedTo target", async () => {
    const h = harness();
    await h.fire("user:deleted", subjectUser, { reassignedTo: 1 });
    expect(h.state.rows[0]).toMatchObject({
      event: "user:deleted",
      subjectType: "user",
      subjectId: "42",
      properties: { reassignedTo: 1 },
    });
  });

  test("user:meta_changed records key names only", async () => {
    const h = harness();
    await h.fire(
      "user:meta_changed",
      { id: 42 },
      { set: { timezone: "UTC" }, removed: ["betaFlag"] },
    );
    expect(h.state.rows[0]).toMatchObject({
      event: "user:meta_changed",
      subjectType: "user",
      subjectLabel: "User #42",
      properties: { metaSet: ["timezone"], metaRemoved: ["betaFlag"] },
    });
  });
});

describe("registerAuditEvents — auth backfill", () => {
  test("user:signed_out self-attributes to the signed-out user", async () => {
    const h = harness(null);
    await h.fire("user:signed_out", subjectUser);
    expect(h.state.rows[0]).toMatchObject({
      event: "user:signed_out",
      subjectType: "user",
      subjectId: "42",
      actorId: 42,
      actorLabel: "bob@example.com",
    });
  });

  test("user:email_change_requested attributes to the explicit context.actor", async () => {
    const h = harness();
    const expiresAt = new Date("2026-05-20T00:00:00Z");
    await h.fire("user:email_change_requested", subjectUser, {
      actor: adminUser,
      newEmail: "bob.new@example.com",
      expiresAt,
    });
    expect(h.state.rows[0]).toMatchObject({
      event: "user:email_change_requested",
      actorId: 7,
      actorLabel: "alice@example.com",
      properties: {
        newEmail: "bob.new@example.com",
        expiresAt: expiresAt.toISOString(),
      },
    });
  });

  test("user:email_changed records [previous, current] email pair", async () => {
    const h = harness();
    await h.fire("user:email_changed", subjectUser, {
      previousEmail: "old@example.com",
    });
    expect(h.state.rows[0]?.properties).toMatchObject({
      email: ["old@example.com", "bob@example.com"],
    });
  });

  test("credential:revoked records the credential subject + userId", async () => {
    const h = harness();
    await h.fire(
      "credential:revoked",
      { id: "cred-2", userId: 42 },
      { actor: adminUser },
    );
    expect(h.state.rows[0]).toMatchObject({
      event: "credential:revoked",
      subjectType: "credential",
      subjectId: "cred-2",
      actorId: 7,
      properties: { userId: 42 },
    });
  });

  test("credential:renamed uses the new name as the subject label", async () => {
    const h = harness();
    await h.fire(
      "credential:renamed",
      { id: "cred-3", userId: 42 },
      { actor: adminUser, name: "Work phone" },
    );
    expect(h.state.rows[0]).toMatchObject({
      event: "credential:renamed",
      subjectType: "credential",
      subjectId: "cred-3",
      subjectLabel: "Work phone",
      properties: { userId: 42 },
    });
  });

  test("session:revoked carries mode + userId", async () => {
    const h = harness();
    await h.fire(
      "session:revoked",
      { id: "sess-1", userId: 42 },
      { actor: adminUser, mode: "all_others" },
    );
    expect(h.state.rows[0]).toMatchObject({
      event: "session:revoked",
      subjectType: "session",
      subjectId: "sess-1",
      properties: { mode: "all_others", userId: 42 },
    });
  });

  test("api_token:created records prefix + scopes + expiresAt iso (or null)", async () => {
    const h = harness();
    await h.fire(
      "api_token:created",
      {
        id: "tok-1",
        userId: 42,
        name: "CI",
        prefix: "pmx_abc",
        scopes: ["entry:read"],
        expiresAt: null,
      },
      { actor: adminUser },
    );
    expect(h.state.rows[0]).toMatchObject({
      event: "api_token:created",
      subjectType: "api_token",
      subjectLabel: "CI",
      properties: {
        prefix: "pmx_abc",
        scopes: ["entry:read"],
        userId: 42,
        expiresAt: null,
      },
    });
  });

  test("device_code:denied labels the row with the userCode", async () => {
    const h = harness();
    await h.fire(
      "device_code:denied",
      { id: "dev-7", userCode: "WXYZ-ABCD" },
      { actor: adminUser },
    );
    expect(h.state.rows[0]).toMatchObject({
      event: "device_code:denied",
      subjectType: "device_code",
      subjectId: "dev-7",
      subjectLabel: "WXYZ-ABCD",
    });
  });
});

describe("registerAuditEvents — term backfill", () => {
  test("term:created produces a row keyed on the term", async () => {
    const h = harness();
    await h.fire("term:created", {
      id: 9,
      taxonomy: "category",
      name: "News",
      slug: "news",
    });
    expect(h.state.rows[0]).toMatchObject({
      event: "term:created",
      subjectType: "term",
      subjectId: "9",
      subjectLabel: "News",
    });
  });

  test("term:meta_changed records taxonomy + key names only", async () => {
    const h = harness();
    await h.fire(
      "term:meta_changed",
      { id: 9, taxonomy: "category" },
      { set: { ordering: 5 }, removed: ["sunset"] },
    );
    expect(h.state.rows[0]).toMatchObject({
      event: "term:meta_changed",
      subjectType: "term",
      subjectId: "9",
      subjectLabel: "Term #9",
      properties: {
        taxonomy: "category",
        metaSet: ["ordering"],
        metaRemoved: ["sunset"],
      },
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// Snapshot + guard
// ──────────────────────────────────────────────────────────────────

describe("auditEvents table", () => {
  test("event list matches a pinned set — add/remove drift surfaces here", () => {
    const events = auditEvents.map((e) => e.event).sort();
    expect(events).toEqual([
      "api_token:created",
      "api_token:revoked",
      "credential:created",
      "credential:renamed",
      "credential:revoked",
      "device_code:approved",
      "device_code:denied",
      "entry:meta_changed",
      "entry:published",
      "entry:transition",
      "entry:trashed",
      "entry:updated",
      "session:revoked",
      "settings:group_changed",
      "term:created",
      "term:deleted",
      "term:meta_changed",
      "term:updated",
      "user:deleted",
      "user:email_change_requested",
      "user:email_changed",
      "user:invited",
      "user:meta_changed",
      "user:registered",
      "user:signed_in",
      "user:signed_out",
      "user:status_changed",
      "user:updated",
    ]);
  });

  test("every event name is unique", () => {
    const names = auditEvents.map((e) => e.event);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("assertRedactionInvariants", () => {
  test("real table satisfies the configured required-redaction map", () => {
    expect(() =>
      assertRedactionInvariants(auditEvents, SUBJECT_REQUIRED_REDACTIONS),
    ).not.toThrow();
  });

  test("throws when a user-subject diff row forgets to omit passwordHash", () => {
    const violating: AuditEventDef[] = [
      {
        event: "user:bad",
        subject: { kind: "extract", type: "user" },
        actor: { kind: "ctx" },
        // `passwordHash` deliberately missing from the omit list.
        diff: { omit: ["createdAt", "updatedAt"] },
      },
    ];
    expect(() =>
      assertRedactionInvariants(violating, SUBJECT_REQUIRED_REDACTIONS),
    ).toThrowError(/user:bad/);
  });

  test("ignores diff-less rows even when subject is in the required map", () => {
    const safe: AuditEventDef[] = [
      {
        event: "user:tagged",
        subject: { kind: "extract", type: "user" },
        actor: { kind: "ctx" },
      },
    ];
    expect(() =>
      assertRedactionInvariants(safe, SUBJECT_REQUIRED_REDACTIONS),
    ).not.toThrow();
  });
});
