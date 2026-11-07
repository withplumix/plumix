import type {
  AppContext,
  AuthenticatedUser,
  EventDefinition,
  PluginSetupContext,
  SetupEvents,
} from "plumix/plugin";
import type { Entry, Term, User } from "plumix/schema";
import {
  auth,
  entry,
  HandlerRegistry,
  settings,
  term,
  user,
} from "plumix/plugin";
import {
  createDispatcherHarness,
  createTestContext,
  plumixRequest,
} from "plumix/test";
import { beforeAll, describe, expect, test } from "vitest";

import type { NewAuditLogRow } from "../db/schema.js";
import type { TestDb } from "../test-support.js";
import type { AuditLogStorage } from "../types.js";
import type { AuditService } from "./auditService.js";
import { auditLog } from "../index.js";
import { createDb } from "../test-support.js";
import {
  assertRedactionInvariants,
  auditedEvents,
  registerAuditEvents,
  SUBJECT_REQUIRED_REDACTIONS,
} from "./auditEvents.js";

// The ambient context is built before sign-in and an authenticated procedure
// works on a copy, so the session rides a cookie, not a pre-signed context.
describe("registerAuditEvents — through a procedure", () => {
  test("a signed-in admin's settings save is attributed to them", async () => {
    const writes: NewAuditLogRow[] = [];
    const storage: AuditLogStorage = {
      kind: "capture",
      write: (_ctx, rows) => {
        writes.push(...rows);
        return Promise.resolve();
      },
      query: () => Promise.resolve({ rows: [], nextCursor: null }),
    };
    const h = await createDispatcherHarness({
      config: { plugins: [auditLog({ storage })] },
    });
    const admin = await h.factory.user.create({ role: "admin" });
    const request = await h.authenticateRequest(
      plumixRequest("/_plumix/rpc/settings/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          json: {
            group: "general",
            values: { site_title: "Renamed" },
            ifMatch: "0",
          },
        }),
      }),
      admin.id,
    );

    const response = await h.dispatch(request);
    await h.drainDeferred();

    expect(response.status).toBe(200);
    const row = writes.find((w) => w.event === "settings:group_changed");
    expect(row?.actorId).toBe(admin.id);
  });

  test("an admin disabling a user is recorded against the user, by the admin", async () => {
    const writes: NewAuditLogRow[] = [];
    const storage: AuditLogStorage = {
      kind: "capture",
      write: (_ctx, rows) => {
        writes.push(...rows);
        return Promise.resolve();
      },
      query: () => Promise.resolve({ rows: [], nextCursor: null }),
    };
    const h = await createDispatcherHarness({
      config: { plugins: [auditLog({ storage })] },
    });
    const admin = await h.factory.user.create({ role: "admin" });
    const target = await h.factory.user.create({ role: "editor" });
    const request = await h.authenticateRequest(
      plumixRequest("/_plumix/rpc/user/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { id: target.id } }),
      }),
      admin.id,
    );

    const response = await h.dispatch(request);
    await h.drainDeferred();

    expect(response.status).toBe(200);
    expect(writes.find((w) => w.event === "user:status_changed")).toMatchObject(
      {
        subjectType: "user",
        subjectId: String(target.id),
        actorId: admin.id,
        properties: { status: ["enabled", "disabled"] },
      },
    );
  });
});

/** The fake service never writes, so one database serves every request. */
let db: TestDb;
beforeAll(async () => {
  db = await createDb();
});

function makeFakeAppCtx(user: AuthenticatedUser | null): AppContext {
  return createTestContext({ db, user });
}

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

interface HarnessHandles {
  readonly handlers: HandlerRegistry;
  readonly state: FakeServiceState;
  readonly emit: <TPayload>(
    event: EventDefinition<TPayload>,
    payload: NoInfer<TPayload>,
  ) => Promise<unknown>;
}

function harness(user: AuthenticatedUser | null = adminUser): HarnessHandles {
  const handlers = new HandlerRegistry();
  const state = fakeService();

  // Minimal PluginSetupContext stand-in: only `events.on` is needed by
  // `registerAuditEvents`. Casting through `unknown` lets us satisfy the
  // strict type without conjuring every register* method.
  const ctx = {
    events: {
      on: (event, handler, options) => {
        handlers.on(event, handler, options);
      },
    } satisfies SetupEvents,
  } as unknown as PluginSetupContext;
  registerAuditEvents(ctx, state.service);

  const fakeCtx = makeFakeAppCtx(user);
  return {
    handlers,
    state,
    emit: (event, payload) => handlers.emit(event, payload, fakeCtx),
  };
}

const adminUser: AuthenticatedUser = {
  id: 7,
  email: "alice@example.com",
  role: "admin",
  meta: {},
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
    await h.emit(entry.published, {
      entry: {
        id: 5,
        title: "Hello",
        slug: "hello",
        type: "post",
        status: "published",
      } as unknown as Entry,
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
});

describe("registerAuditEvents — user surface", () => {
  test("user:status_changed encodes the toggle as a [from, to] tuple", async () => {
    const h = harness();
    await h.emit(user.statusChanged, { user: subjectUser, enabled: false });
    expect(h.state.rows[0]).toMatchObject({
      event: "user:status_changed",
      subjectType: "user",
      subjectId: "42",
      subjectLabel: "Bob",
      properties: { status: ["enabled", "disabled"] },
    });
  });

  test("user:status_changed encodes a re-enable as the reverse tuple", async () => {
    const h = harness();
    await h.emit(user.statusChanged, { user: subjectUser, enabled: true });
    expect(h.state.rows[0]?.properties).toEqual({
      status: ["disabled", "enabled"],
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
    await h.emit(user.updated, { user: next, previous });

    const row = h.state.rows[0];
    if (!row) throw new Error("expected a captured row");
    expect(row.event).toBe("user:updated");
    const diff = row.properties?.diff as
      Record<string, [unknown, unknown]> | undefined;
    // `name` and `role` differed; `meta` + `updatedAt` are stripped.
    expect(diff).toBeDefined();
    expect(Object.keys(diff ?? {}).sort()).toEqual(["name", "role"]);
    expect(diff?.name).toEqual(["Bobby", "Bob"]);
  });

  test("user:invited attributes to invitedBy with admin email as label, never logs the invite token", async () => {
    const h = harness();
    const expiresAt = new Date("2026-05-17T00:00:00Z");
    await h.emit(user.invited, {
      user: subjectUser,
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
    await h.emit(user.invited, {
      user: subjectUser,
      inviteToken: "secret-do-not-log",
      invitedBy: 9,
      expiresAt,
    });
    const row = h.state.rows[0];
    expect(row?.actorId).toBe(9);
    expect(row?.actorLabel).toBe("9");
  });

  test("user:registered self-attributes when ctx.user is null", async () => {
    const h = harness(null);
    await h.emit(auth.registered, { user: subjectUser });
    const row = h.state.rows[0];
    expect(row?.event).toBe("user:registered");
    expect(row?.actorId).toBe(42);
    expect(row?.actorLabel).toBe("bob@example.com");
  });
});

describe("registerAuditEvents — auth surface", () => {
  test("user:signed_in self-attributes (ctx.user is null at sign-in time)", async () => {
    const h = harness(null);
    await h.emit(auth.signedIn, {
      user: subjectUser,
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
    await h.emit(auth.credentialCreated, {
      credential: {
        id: "cred-1",
        userId: 42,
        name: "My laptop",
        deviceType: "single_device",
        isBackedUp: true,
      },
      actor: adminUser,
    });
    expect(h.state.rows[0]).toMatchObject({
      event: "credential:created",
      subjectType: "credential",
      subjectId: "cred-1",
      subjectLabel: "My laptop",
      actorId: 7,
      actorLabel: "alice@example.com",
      properties: {
        deviceType: "single_device",
        isBackedUp: true,
        userId: 42,
      },
    });
  });

  test("api_token:revoked includes the mode (self vs admin) for downstream copy", async () => {
    const h = harness();
    await h.emit(auth.apiTokenRevoked, {
      apiToken: { id: "tok-9", userId: 42 },
      actor: adminUser,
      mode: "admin",
    });
    expect(h.state.rows[0]?.properties).toMatchObject({
      mode: "admin",
      userId: 42,
    });
  });

  test("device_code:approved labels the row with the userCode", async () => {
    const h = harness();
    await h.emit(auth.deviceCodeApproved, {
      deviceCode: {
        id: "dev-9",
        userCode: "ABCD-WXYZ",
        tokenName: "CI deploy",
        scopes: ["entry:read"],
      },
      actor: adminUser,
    });
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
    await h.emit(term.updated, { term: next, previous });

    const row = h.state.rows[0];
    if (!row) throw new Error("expected a captured row");
    expect(row.event).toBe("term:updated");
    const diff = row.properties?.diff as
      Record<string, [unknown, unknown]> | undefined;
    expect(diff).toBeDefined();
    expect(Object.keys(diff ?? {}).sort()).toEqual([
      "name",
      "parentId",
      "slug",
    ]);
  });

  test("term:deleted produces a final row even though the source row is gone", async () => {
    const h = harness();
    await h.emit(term.deleted, {
      term: {
        id: 3,
        taxonomy: "category",
        name: "Old news",
        slug: "old-news",
      } as unknown as Term,
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
    await h.emit(settings.for("mailer").groupChanged, {
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
    await h.emit(entry.updated, {
      entry: next as unknown as Entry,
      previous: previous as unknown as Entry,
    });
    const row = h.state.rows[0];
    expect(row?.event).toBe("entry:updated");
    expect(row?.subjectType).toBe("entry");
    const diff = row?.properties?.diff as
      Record<string, [unknown, unknown]> | undefined;
    expect(Object.keys(diff ?? {}).sort()).toEqual(["title"]);
  });

  test("entry:transition records the from→to status pair", async () => {
    const h = harness();
    await h.emit(entry.transition, {
      entry: { ...subjectEntry, status: "published" } as unknown as Entry,
      previousStatus: "draft" as const,
    });
    expect(h.state.rows[0]).toMatchObject({
      event: "entry:transition",
      subjectType: "entry",
      properties: { status: { from: "draft", to: "published" } },
    });
  });

  test("entry:trashed produces a row keyed on the entry", async () => {
    const h = harness();
    await h.emit(entry.trashed, {
      entry: subjectEntry as unknown as Entry,
    });
    expect(h.state.rows[0]).toMatchObject({
      event: "entry:trashed",
      subjectType: "entry",
      subjectId: "11",
      subjectLabel: "Some Post",
    });
  });

  test("entry:restored produces a row keyed on the entry", async () => {
    const h = harness();
    await h.emit(entry.restored, {
      entry: subjectEntry as unknown as Entry,
    });
    expect(h.state.rows[0]).toMatchObject({
      event: "entry:restored",
      subjectType: "entry",
      subjectId: "11",
      subjectLabel: "Some Post",
    });
  });

  test("entry:deleted produces a row keyed on the entry", async () => {
    const h = harness();
    await h.emit(entry.deleted, {
      entry: subjectEntry as unknown as Entry,
    });
    expect(h.state.rows[0]).toMatchObject({
      event: "entry:deleted",
      subjectType: "entry",
      subjectId: "11",
      subjectLabel: "Some Post",
    });
  });

  test("entry:meta_changed records set/removed key names only", async () => {
    const h = harness();
    await h.emit(entry.metaChanged, {
      entry: { id: 11, type: "post" },
      changes: {
        set: { coAuthor: "alice", featured: true },
        removed: ["draftNote"],
      },
    });
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
    await h.emit(user.deleted, { user: subjectUser, reassignedTo: 1 });
    expect(h.state.rows[0]).toMatchObject({
      event: "user:deleted",
      subjectType: "user",
      subjectId: "42",
      properties: { reassignedTo: 1 },
    });
  });

  test("user:meta_changed records key names only", async () => {
    const h = harness();
    await h.emit(user.metaChanged, {
      user: { id: 42 },
      changes: { set: { timezone: "UTC" }, removed: ["betaFlag"] },
    });
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
    await h.emit(auth.signedOut, { user: subjectUser });
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
    await h.emit(auth.emailChangeRequested, {
      user: subjectUser,
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
    await h.emit(auth.emailChanged, {
      user: subjectUser,
      previousEmail: "old@example.com",
    });
    expect(h.state.rows[0]?.properties).toMatchObject({
      email: ["old@example.com", "bob@example.com"],
    });
  });

  test("credential:revoked records the credential subject + userId", async () => {
    const h = harness();
    await h.emit(auth.credentialRevoked, {
      credential: { id: "cred-2", userId: 42 },
      actor: adminUser,
    });
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
    await h.emit(auth.credentialRenamed, {
      credential: { id: "cred-3", userId: 42 },
      actor: adminUser,
      name: "Work phone",
    });
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
    await h.emit(auth.sessionRevoked, {
      session: { id: "sess-1", userId: 42 },
      actor: adminUser,
      mode: "all_others",
    });
    expect(h.state.rows[0]).toMatchObject({
      event: "session:revoked",
      subjectType: "session",
      subjectId: "sess-1",
      properties: { mode: "all_others", userId: 42 },
    });
  });

  test("api_token:created records prefix + scopes + expiresAt iso (or null)", async () => {
    const h = harness();
    await h.emit(auth.apiTokenCreated, {
      apiToken: {
        id: "tok-1",
        userId: 42,
        name: "CI",
        prefix: "pmx_abc",
        scopes: ["entry:read"],
        expiresAt: null,
      },
      actor: adminUser,
    });
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
    await h.emit(auth.deviceCodeDenied, {
      deviceCode: { id: "dev-7", userCode: "WXYZ-ABCD" },
      actor: adminUser,
    });
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
    await h.emit(term.created, {
      term: {
        id: 9,
        taxonomy: "category",
        name: "News",
        slug: "news",
      } as unknown as Term,
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
    await h.emit(term.metaChanged, {
      term: { id: 9, taxonomy: "category" },
      changes: { set: { ordering: 5 }, removed: ["sunset"] },
    });
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
  test("registers one listener for each audited event, and no others", () => {
    const registered: string[] = [];
    const ctx = {
      events: {
        on: (event) => {
          registered.push(event.id);
        },
      } satisfies SetupEvents,
    } as unknown as PluginSetupContext;
    registerAuditEvents(ctx, fakeService().service);
    expect(registered.sort()).toEqual([
      "auth:apiTokenCreated",
      "auth:apiTokenRevoked",
      "auth:credentialCreated",
      "auth:credentialRenamed",
      "auth:credentialRevoked",
      "auth:deviceCodeApproved",
      "auth:deviceCodeDenied",
      "auth:emailChangeRequested",
      "auth:emailChanged",
      "auth:registered",
      "auth:sessionRevoked",
      "auth:signedIn",
      "auth:signedOut",
      "entry:deleted",
      "entry:metaChanged",
      "entry:published",
      "entry:restored",
      "entry:transition",
      "entry:trashed",
      "entry:updated",
      "settings:groupChanged",
      "term:created",
      "term:deleted",
      "term:metaChanged",
      "term:updated",
      "user:deleted",
      "user:invited",
      "user:metaChanged",
      "user:statusChanged",
      "user:updated",
    ]);
  });
});

describe("assertRedactionInvariants", () => {
  test("real tables satisfy the configured required-redaction map", () => {
    expect(() =>
      assertRedactionInvariants(auditedEvents, SUBJECT_REQUIRED_REDACTIONS),
    ).not.toThrow();
  });

  test("throws when a user-subject diff row forgets to omit passwordHash", () => {
    const violating = [
      {
        event: "user:bad",
        subject: { kind: "extract", type: "user" },
        // `passwordHash` deliberately missing from the omit list.
        diff: { omit: ["createdAt", "updatedAt"] },
      },
    ];
    expect(() =>
      assertRedactionInvariants(violating, SUBJECT_REQUIRED_REDACTIONS),
    ).toThrow(/user:bad/);
  });

  test("ignores diff-less rows even when subject is in the required map", () => {
    const safe = [
      {
        event: "user:tagged",
        subject: { kind: "extract", type: "user" },
      },
    ];
    expect(() =>
      assertRedactionInvariants(safe, SUBJECT_REQUIRED_REDACTIONS),
    ).not.toThrow();
  });
});
