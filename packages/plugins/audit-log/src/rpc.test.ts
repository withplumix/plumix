import type {
  AppContext,
  RequestAuthenticator,
  User,
  UserRole,
} from "plumix/plugin";
import { createRouterClient } from "@orpc/server";
import {
  createAppContext,
  createPluginRegistry,
  HookRegistry,
} from "plumix/plugin";
import { describe, expect, test } from "vitest";

import type {
  AuditLogQueryFilter,
  AuditLogQueryResult,
  AuditLogStorage,
} from "./types.js";
import { createAuditLogRouter } from "./rpc.js";
import { CursorError } from "./server/cursor.js";

interface HarnessClient {
  readonly auditLog: {
    readonly list: (
      input?: Partial<AuditLogQueryFilter>,
    ) => Promise<AuditLogQueryResult>;
  };
}

interface Harness {
  readonly client: HarnessClient;
  readonly calls: AuditLogQueryFilter[];
  readonly storage: AuditLogStorage;
}

function fakeStorage(
  reply: AuditLogQueryResult = { rows: [], nextCursor: null },
): { storage: AuditLogStorage; calls: AuditLogQueryFilter[] } {
  const calls: AuditLogQueryFilter[] = [];
  return {
    calls,
    storage: {
      kind: "fake",
      write: () => Promise.resolve(),
      query: (_ctx, filter) => {
        calls.push(filter);
        return Promise.resolve(reply);
      },
    },
  };
}

function stubAuthenticator(user: User): RequestAuthenticator {
  return {
    authenticate: () => Promise.resolve({ user, tokenScopes: null }),
  };
}

function buildContext(role: UserRole): AppContext {
  const registry = createPluginRegistry();
  // Mirror the audit-log plugin's setup() — register the capability so
  // the role-based resolver knows admin → audit_log:read.
  registry.capabilities.set("audit_log:read", {
    name: "audit_log:read",
    minRole: "admin",
    registeredBy: "audit_log",
  });
  const user: User = {
    id: 1,
    email: "alice@example.com",
    role,
    name: null,
    avatarUrl: null,
    meta: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    emailVerifiedAt: null,
    disabledAt: null,
  };
  return createAppContext({
    db: {} as never,
    env: {},
    request: new Request("https://cms.example/_plumix/rpc", { method: "POST" }),
    hooks: new HookRegistry(),
    plugins: registry,
    user: { id: user.id, email: user.email, role: user.role },
    authenticator: stubAuthenticator(user),
    origin: "https://cms.example",
  });
}

function harness(role: UserRole, reply?: AuditLogQueryResult): Harness {
  const { storage, calls } = fakeStorage(reply);
  const router = createAuditLogRouter(storage);
  const client = createRouterClient(
    { auditLog: router },
    { context: buildContext(role) },
  ) as unknown as HarnessClient;
  return { client, calls, storage };
}

describe("auditLog.list RPC", () => {
  test("forwards filter params verbatim to storage", async () => {
    const h = harness("admin");
    await h.client.auditLog.list({
      actorId: 7,
      subjectType: "entry",
      subjectId: "42",
      eventPrefix: "entry:",
      occurredAfter: 1_715_000_000,
      occurredBefore: 1_715_100_000,
      limit: 25,
    });
    expect(h.calls[0]).toMatchObject({
      actorId: 7,
      subjectType: "entry",
      subjectId: "42",
      eventPrefix: "entry:",
      occurredAfter: 1_715_000_000,
      occurredBefore: 1_715_100_000,
      limit: 25,
    });
  });

  test("returns rows + nextCursor from storage", async () => {
    const reply: AuditLogQueryResult = {
      rows: [
        {
          id: 1,
          occurredAt: new Date("2026-05-10T00:00:00Z"),
          event: "entry:published",
          subjectType: "entry",
          subjectId: "1",
          subjectLabel: "Hello",
          actorId: 1,
          actorLabel: "alice@example.com",
          properties: {},
        },
      ],
      nextCursor: "cursor-from-storage",
    };
    const h = harness("admin", reply);
    const result = await h.client.auditLog.list({});
    expect(result.nextCursor).toBe("cursor-from-storage");
    expect(result.rows).toHaveLength(1);
  });

  test("limit > 200 is silently clamped to 200 (not an error)", async () => {
    const h = harness("admin");
    await h.client.auditLog.list({ limit: 5000 });
    expect(h.calls[0]?.limit).toBe(200);
  });

  test("limit < 1 is rejected at the schema level", async () => {
    const h = harness("admin");
    await expect(h.client.auditLog.list({ limit: 0 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("tampered cursor is rejected with a typed BAD_REQUEST (not a 500)", async () => {
    // Storage decodes the cursor lazily, so the handler needs to
    // surface CursorError as a typed RPC error rather than letting
    // it propagate as an internal-server error.
    const reply: AuditLogQueryResult = { rows: [], nextCursor: null };
    const { calls } = fakeStorage(reply);
    const failingStorage: AuditLogStorage = {
      kind: "fake",
      write: () => Promise.resolve(),
      query: (_ctx, filter) => {
        calls.push(filter);
        // Storage simulates cursor.decodeCursor() failure.
        return Promise.reject(new CursorError("malformed cursor"));
      },
    };
    const router = createAuditLogRouter(failingStorage);
    const client = createRouterClient(
      { auditLog: router },
      { context: buildContext("admin") },
    ) as unknown as HarnessClient;
    await expect(
      client.auditLog.list({ cursor: "not-a-cursor" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "invalid_cursor" },
    });
  });

  test("missing capability rejects with FORBIDDEN", async () => {
    const h = harness("editor");
    await expect(h.client.auditLog.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("omitting all filters returns the latest unfiltered page", async () => {
    const h = harness("admin");
    await h.client.auditLog.list({});
    expect(h.calls[0]).toEqual({ limit: 50 });
  });
});
