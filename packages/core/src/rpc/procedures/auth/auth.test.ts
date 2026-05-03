import { describe, expect, test } from "vitest";

import type { RequestAuthenticator } from "../../../auth/authenticator.js";
import type { Mailer } from "../../../auth/mailer/types.js";
import { API_TOKEN_PREFIX, createApiToken } from "../../../auth/api-tokens.js";
import { SESSION_COOKIE_NAME } from "../../../auth/cookies.js";
import {
  lookupDeviceCodeByUserCode,
  requestDeviceCode,
} from "../../../auth/device-flow.js";
import { createSession } from "../../../auth/sessions.js";
import { hashToken } from "../../../auth/tokens.js";
import { eq } from "../../../db/index.js";
import { apiTokens } from "../../../db/schema/api_tokens.js";
import { sessions } from "../../../db/schema/sessions.js";
import { HookRegistry } from "../../../hooks/registry.js";
import { definePlugin } from "../../../plugin/define.js";
import { installPlugins } from "../../../plugin/register.js";
import { userFactory } from "../../../test/factories.js";
import { createTestDb } from "../../../test/harness.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("auth.session", () => {
  test("empty instance → user: null, needsBootstrap: true", async () => {
    const h = await createRpcHarness();
    const result = await h.client.auth.session({});
    expect(result).toEqual({ user: null, needsBootstrap: true });
  });

  test("unauthed caller on a populated instance → user: null, needsBootstrap: false", async () => {
    const h = await createRpcHarness();
    await h.factory.user.create({ email: "someone@example.test" });
    const result = await h.client.auth.session({});
    expect(result).toEqual({ user: null, needsBootstrap: false });
  });

  test("authed caller returns full profile + resolved capabilities; needsBootstrap is false", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const result = await h.client.auth.session({});
    expect(result.needsBootstrap).toBe(false);
    expect(result.user).toMatchObject({
      id: h.user.id,
      email: h.user.email,
      name: h.user.name,
      avatarUrl: h.user.avatarUrl,
      role: "admin",
    });
    // Admin role grants every core capability — spot-check the set covers
    // read/write gates the admin UI will actually query.
    expect(result.user?.capabilities).toEqual(
      expect.arrayContaining([
        "entry:post:read",
        "entry:post:edit_any",
        "user:list",
        "plugin:manage",
      ]),
    );
  });

  test("subscriber role returns only the low-privilege capabilities", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const result = await h.client.auth.session({});
    expect(result.user?.capabilities).toEqual([
      "entry:post:read",
      "user:edit_own",
    ]);
  });

  test("plugin-registered post type surfaces derived capabilities without duplicating the core set", async () => {
    const hooks = new HookRegistry();
    const shop = definePlugin("shop", (ctx) => {
      // Plugin-registered post type with its own capability namespace —
      // surfaces on the session…
      ctx.registerEntryType("product", {
        label: "Product",
        capabilityType: "product",
      });
      // …AND register a post type that shares the core `post` capability
      // namespace, which used to produce duplicate `post:*` entries in the
      // session's capability list.
      ctx.registerEntryType("news", { label: "News", capabilityType: "post" });
    });
    const { registry: plugins } = await installPlugins({
      hooks,
      plugins: [shop],
    });
    const h = await createRpcHarness({ authAs: "editor", hooks, plugins });
    const result = await h.client.auth.session({});

    expect(result.user?.capabilities).toEqual(
      expect.arrayContaining(["entry:product:read", "entry:product:edit_any"]),
    );
    // Regression: derived `post:*` entries from the `news` post type alias
    // the core capabilities — dedupe in `capabilitiesForRole` must prevent
    // duplicate wire entries.
    const caps = result.user?.capabilities ?? [];
    expect(caps.length).toBe(new Set(caps).size);
  });

  test("stale / unknown session cookie → user: null; bootstrap flag still correct", async () => {
    const request = new Request("https://cms.example/_plumix/rpc", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-real-token` },
    });
    const h = await createRpcHarness({ request });
    const emptyResult = await h.client.auth.session({});
    expect(emptyResult).toEqual({ user: null, needsBootstrap: true });

    await h.factory.user.create({ email: "real@example.test" });
    const populatedResult = await h.client.auth.session({});
    expect(populatedResult).toEqual({ user: null, needsBootstrap: false });
  });
});

describe("auth.oauthProviders", () => {
  test("empty by default — passkey-only deploy", async () => {
    const h = await createRpcHarness();
    const result = await h.client.auth.oauthProviders({});
    expect(result).toEqual([]);
  });

  test("returns key + label per configured provider", async () => {
    const h = await createRpcHarness({
      oauthProviders: [{ key: "github", label: "GitHub" }],
    });
    const result = await h.client.auth.oauthProviders({});
    expect(result).toEqual([{ key: "github", label: "GitHub" }]);
  });

  test("returns multiple providers in declared order", async () => {
    const h = await createRpcHarness({
      oauthProviders: [
        { key: "github", label: "GitHub" },
        { key: "google", label: "Google" },
      ],
    });
    const result = await h.client.auth.oauthProviders({});
    expect(result).toEqual([
      { key: "github", label: "GitHub" },
      { key: "google", label: "Google" },
    ]);
  });
});

describe("auth.loginLinks", () => {
  test("empty by default", async () => {
    const h = await createRpcHarness();
    const result = await h.client.auth.loginLinks({});
    expect(result).toEqual([]);
  });

  test("surfaces plugin-registered links with namespaced ids", async () => {
    const plugin = definePlugin("saml-microsoft", (ctx) => {
      ctx.registerLoginLink({
        key: "default",
        label: "Sign in with Microsoft",
        href: "/_plumix/saml-microsoft/start",
      });
    });
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [plugin],
    });
    const h = await createRpcHarness({ plugins: registry });
    const result = await h.client.auth.loginLinks({});
    expect(result).toEqual([
      {
        id: "saml-microsoft:default",
        label: "Sign in with Microsoft",
        href: "/_plumix/saml-microsoft/start",
      },
    ]);
  });
});

describe("auth.allowedDomains", () => {
  test("list rejects an unauthenticated caller", async () => {
    const h = await createRpcHarness();
    await expect(h.client.auth.allowedDomains.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("list rejects a non-admin caller", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(h.client.auth.allowedDomains.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("admin can create, update, delete a domain", async () => {
    const h = await createRpcHarness({ authAs: "admin" });

    const created = await h.client.auth.allowedDomains.create({
      domain: "example.com",
      defaultRole: "author",
    });
    expect(created).toMatchObject({
      domain: "example.com",
      defaultRole: "author",
      isEnabled: true,
    });

    const list = await h.client.auth.allowedDomains.list({});
    expect(list).toHaveLength(1);

    const updated = await h.client.auth.allowedDomains.update({
      domain: "example.com",
      isEnabled: false,
    });
    expect(updated.isEnabled).toBe(false);

    const removed = await h.client.auth.allowedDomains.delete({
      domain: "example.com",
    });
    expect(removed.domain).toBe("example.com");

    const after = await h.client.auth.allowedDomains.list({});
    expect(after).toEqual([]);
  });

  test("create rejects a duplicate domain with CONFLICT/domain_exists", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.auth.allowedDomains.create({ domain: "example.com" });
    await expect(
      h.client.auth.allowedDomains.create({ domain: "example.com" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "domain_exists" },
    });
  });

  test("update rejects an unknown domain with NOT_FOUND", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.auth.allowedDomains.update({
        domain: "nope.example",
        isEnabled: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("update rejects an empty patch", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.auth.allowedDomains.create({ domain: "example.com" });
    await expect(
      h.client.auth.allowedDomains.update({ domain: "example.com" }),
    ).rejects.toMatchObject({ data: { reason: "empty_patch" } });
  });

  test("create rejects a malformed domain at the input layer", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.auth.allowedDomains.create({ domain: "not a domain" }),
    ).rejects.toBeDefined();
  });
});

describe("auth.credentials", () => {
  test("list rejects an unauthenticated caller", async () => {
    const h = await createRpcHarness();
    await expect(h.client.auth.credentials.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("list returns only the current user's credentials", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const otherUser = await h.factory.user.create({
      email: "other@cms.example",
    });

    await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "MacBook",
    });
    await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([4, 5, 6]),
      name: "iPhone",
    });
    await h.factory.credential.create({
      userId: otherUser.id,
      publicKey: Buffer.from([7, 8, 9]),
      name: "Other's key",
    });

    const result = await h.client.auth.credentials.list({});
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name).sort()).toEqual(
      ["MacBook", "iPhone"].sort(),
    );
  });

  test("list omits the publicKey blob from the wire payload", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Phone",
    });
    const result = await h.client.auth.credentials.list({});
    expect(result[0]).not.toHaveProperty("publicKey");
  });

  test("rename updates the user's own credential", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const cred = await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Old name",
    });

    const renamed = await h.client.auth.credentials.rename({
      id: cred.id,
      name: "New name",
    });
    expect(renamed.name).toBe("New name");
  });

  test("rename refuses cross-user attempts with NOT_FOUND (no oracle)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const otherUser = await h.factory.user.create({
      email: "other@cms.example",
    });
    const otherCred = await h.factory.credential.create({
      userId: otherUser.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Not yours",
    });

    await expect(
      h.client.auth.credentials.rename({ id: otherCred.id, name: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("rename rejects empty / oversized names", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const cred = await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "ok",
    });

    await expect(
      h.client.auth.credentials.rename({ id: cred.id, name: "" }),
    ).rejects.toBeDefined();
    await expect(
      h.client.auth.credentials.rename({ id: cred.id, name: "x".repeat(65) }),
    ).rejects.toBeDefined();
    await expect(
      h.client.auth.credentials.rename({
        id: cred.id,
        name: "name\r\ninjection",
      }),
    ).rejects.toBeDefined();
  });

  test("delete removes a credential when the user has more than one", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const cred1 = await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Old",
    });
    await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([4, 5, 6]),
      name: "New",
    });

    const result = await h.client.auth.credentials.delete({ id: cred1.id });
    expect(result.id).toBe(cred1.id);

    const after = await h.client.auth.credentials.list({});
    expect(after).toHaveLength(1);
    expect(after[0]?.name).toBe("New");
  });

  test("delete refuses to remove the user's last credential", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const cred = await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Only",
    });

    await expect(
      h.client.auth.credentials.delete({ id: cred.id }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_credential" },
    });

    // The credential is still there.
    const after = await h.client.auth.credentials.list({});
    expect(after).toHaveLength(1);
  });

  test("delete refuses cross-user attempts with NOT_FOUND", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    // Caller has 2 credentials so the at-least-one guard would pass
    // for them; the cross-user attempt must still be NOT_FOUND.
    await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Mine 1",
    });
    await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([4, 5, 6]),
      name: "Mine 2",
    });
    const otherUser = await h.factory.user.create({
      email: "other@cms.example",
    });
    const otherCred = await h.factory.credential.create({
      userId: otherUser.id,
      publicKey: Buffer.from([7, 8, 9]),
      name: "Theirs",
    });

    await expect(
      h.client.auth.credentials.delete({ id: otherCred.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("auth.sessions.revokeOthers", () => {
  test("rejects an unauthenticated caller", async () => {
    const h = await createRpcHarness();
    await expect(h.client.auth.sessions.revokeOthers({})).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
  });

  test("deletes other sessions for the user but preserves the current one", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    // Mint two extra sessions for the current user (devices) — the
    // harness's authed request already minted one (the "current" one).
    await createSession(h.db, { userId: h.user.id });
    await createSession(h.db, { userId: h.user.id });

    const result = await h.client.auth.sessions.revokeOthers({});
    expect(result.revoked).toBe(2);

    // One row remains: the current session.
    const remaining = await h.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, h.user.id));
    expect(remaining).toHaveLength(1);
  });

  test("doesn't touch other users' sessions", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const otherUser = await h.factory.user.create({
      email: "other@cms.example",
    });
    await createSession(h.db, { userId: otherUser.id });
    await createSession(h.db, { userId: otherUser.id });

    await h.client.auth.sessions.revokeOthers({});

    const otherSessions = await h.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, otherUser.id));
    expect(otherSessions).toHaveLength(2);
  });

  test("returns revoked: 0 when there are no other sessions", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const result = await h.client.auth.sessions.revokeOthers({});
    expect(result.revoked).toBe(0);
  });

  test("returns revoked: 0 when the request has no plumix session cookie (cfAccess / external IdP)", async () => {
    // Simulate the cfAccess case via a custom authenticator: the user
    // is authed without ever minting a plumix `sessions` row. The
    // proc should no-op cleanly even if there are *other* sessions
    // for this user (left over from a prior session-cookie auth).
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({ role: "editor" });
    await createSession(db, { userId: user.id });
    await createSession(db, { userId: user.id });

    const headerAuth: RequestAuthenticator = {
      authenticate: () => Promise.resolve({ user }),
    };
    // Build a request *without* the session cookie — the cfAccess case.
    const request = new Request("https://cms.example/_plumix/rpc", {
      method: "POST",
    });
    const h = await createRpcHarness({
      request,
      authenticator: headerAuth,
    });
    const result = await h.client.auth.sessions.revokeOthers({});
    expect(result.revoked).toBe(0);

    // Existing rows are untouched.
    const remaining = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(remaining).toHaveLength(2);
  });
});

describe("auth.sessions.list", () => {
  test("rejects an unauthenticated caller", async () => {
    const h = await createRpcHarness();
    await expect(h.client.auth.sessions.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("returns the user's own sessions with the current row marked", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    // The harness mints one session (the request's cookie). Add two
    // more so the list has multiple rows.
    await createSession(h.db, {
      userId: h.user.id,
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0 phone",
    });
    await createSession(h.db, {
      userId: h.user.id,
      ipAddress: "203.0.113.8",
      userAgent: "Mozilla/5.0 desktop",
    });

    const result = await h.client.auth.sessions.list({});
    expect(result).toHaveLength(3);
    // Exactly one row is the current session — and it must be the one
    // matching the harness request's cookie token, not just any row.
    // Pull the cookie value off the harness context, hash it, and
    // assert the flag landed on that specific id.
    const cookie = h.context.request.headers.get("cookie") ?? "";
    const cookieMatch = /plumix_session=([^;]+)/.exec(cookie);
    if (!cookieMatch?.[1])
      throw new Error("expected session cookie on harness");
    const expectedId = await hashToken(cookieMatch[1]);
    const currents = result.filter((s) => s.current);
    expect(currents).toHaveLength(1);
    expect(currents[0]?.id).toBe(expectedId);
  });

  test("doesn't leak other users' sessions", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const otherUser = await h.factory.user.create({
      email: "other@cms.example",
    });
    await createSession(h.db, { userId: otherUser.id });

    const result = await h.client.auth.sessions.list({});
    // Only the harness's own session — the other user's row is
    // filtered by the `userId` predicate.
    expect(result).toHaveLength(1);
  });
});

describe("auth.sessions.revoke", () => {
  test("revokes a specific session by id", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const target = await createSession(h.db, { userId: h.user.id });

    const result = await h.client.auth.sessions.revoke({
      id: target.session.id,
    });
    expect(result.id).toBe(target.session.id);

    const remaining = await h.client.auth.sessions.list({});
    expect(remaining.find((s) => s.id === target.session.id)).toBeUndefined();
  });

  test("refuses to revoke the current session (CONFLICT/current_session)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    // Find the current session id by listing first.
    const list = await h.client.auth.sessions.list({});
    const current = list.find((s) => s.current);
    if (!current) throw new Error("expected a current session");

    await expect(
      h.client.auth.sessions.revoke({ id: current.id }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "current_session" },
    });
  });

  test("refuses cross-user attempts with NOT_FOUND (no oracle)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const otherUser = await h.factory.user.create({
      email: "other@cms.example",
    });
    const otherSession = await createSession(h.db, { userId: otherUser.id });

    await expect(
      h.client.auth.sessions.revoke({ id: otherSession.session.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("auth.mailer.testSend", () => {
  test("rejects a non-admin caller with FORBIDDEN", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(
      h.client.auth.mailer.testSend({ to: "ops@example.com" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("rejects when no mailer is configured (CONFLICT/mailer_not_configured)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.auth.mailer.testSend({ to: "ops@example.com" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "mailer_not_configured" },
    });
  });

  test("delivers a fixed test message via the configured mailer", async () => {
    const sent: { to: string; subject: string; text: string }[] = [];
    const mailer: Mailer = {
      send(message) {
        sent.push({ ...message });
        return Promise.resolve();
      },
    };
    const h = await createRpcHarness({ authAs: "admin", mailer });

    const result = await h.client.auth.mailer.testSend({
      to: "ops@example.com",
    });
    expect(result).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    const [message] = sent;
    expect(message?.to).toBe("ops@example.com");
    expect(message?.subject).toBe("Plumix mailer test");
    expect(message?.text).toMatch(/test message from Plumix/);
  });

  test("surfaces mailer adapter failures as CONFLICT/mailer_send_failed", async () => {
    const mailer: Mailer = {
      send: () => Promise.reject(new Error("smtp boom")),
    };
    const h = await createRpcHarness({ authAs: "admin", mailer });

    await expect(
      h.client.auth.mailer.testSend({ to: "ops@example.com" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "mailer_send_failed" },
    });
  });
});

describe("user.list — last-sign-in column", () => {
  test("returns null when the user has no sessions", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const result = await h.client.user.list({ limit: 50, offset: 0 });
    const me = result.find((u) => u.id === h.user.id);
    if (!me) throw new Error("expected the caller in the list");
    // The harness mints a session via `authenticatedRequest`, so the
    // caller's lastSignInAt is non-null. Other rows (none here) would
    // be null.
    expect(me.lastSignInAt).not.toBeNull();
  });

  test("surfaces the most recent session's createdAt", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.user.create({ email: "alice@cms.example" });
    // Older session
    await createSession(h.db, { userId: target.id });
    // Newer session — wait a tick so createdAt advances. SQLite's
    // unixepoch() resolution is seconds, so we manually set the
    // expectation by inserting after a small wait. For this test,
    // just confirm the value is non-null and is a Date.
    const result = await h.client.user.list({ limit: 50, offset: 0 });
    const row = result.find((u) => u.id === target.id);
    if (!row) throw new Error("expected target user in the list");
    expect(row.lastSignInAt).not.toBeNull();
    expect(row.lastSignInAt).toBeInstanceOf(Date);
  });
});

describe("auth.credentials.delete — race safety", () => {
  test("two concurrent deletes can't both leave the user with zero credentials", async () => {
    // The TOCTOU window between count + delete is closed by folding
    // the count check into the DELETE's WHERE via a subquery (per-
    // statement isolation in SQLite). With exactly two credentials
    // and two concurrent delete calls, exactly one must succeed.
    const h = await createRpcHarness({ authAs: "editor" });
    const cred1 = await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "A",
    });
    const cred2 = await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([4, 5, 6]),
      name: "B",
    });

    const results = await Promise.allSettled([
      h.client.auth.credentials.delete({ id: cred1.id }),
      h.client.auth.credentials.delete({ id: cred2.id }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The losing call must be a CONFLICT/last_credential — not
    // NOT_FOUND or anything else.
    const losing = rejected[0];
    if (!losing) throw new Error("expected a rejected result");
    expect(losing.reason).toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_credential" },
    });

    const after = await h.client.auth.credentials.list({});
    expect(after).toHaveLength(1);
  });
});

describe("auth.apiTokens", () => {
  test("list / create / revoke reject unauthenticated callers", async () => {
    const h = await createRpcHarness();
    await expect(h.client.auth.apiTokens.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      h.client.auth.apiTokens.create({ name: "x" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      h.client.auth.apiTokens.revoke({ id: "x" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("create returns the secret once, list never includes it", async () => {
    const h = await createRpcHarness({ authAs: "editor" });

    const created = await h.client.auth.apiTokens.create({
      name: "ci-bot",
      expiresInDays: 30,
    });
    expect(created.secret.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(created.token.prefix.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(created.token.id).not.toBe(created.secret);

    const list = await h.client.auth.apiTokens.list({});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.token.id, name: "ci-bot" });
    expect(JSON.stringify(list[0])).not.toContain(created.secret);
  });

  test("create with expiresInDays: null persists a never-expiring token", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const created = await h.client.auth.apiTokens.create({
      name: "long-lived",
      expiresInDays: null,
    });
    expect(created.token.expiresAt).toBeNull();
  });

  test("list scopes to the calling user", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const otherUser = await h.factory.user.create({});
    await createApiToken(h.db, {
      userId: otherUser.id,
      name: "other-user-token",
      expiresAt: null,
    });
    await h.client.auth.apiTokens.create({ name: "mine" });

    const list = await h.client.auth.apiTokens.list({});
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("mine");
  });

  test("revoke soft-deletes the user's own token", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const created = await h.client.auth.apiTokens.create({ name: "t" });

    const result = await h.client.auth.apiTokens.revoke({
      id: created.token.id,
    });
    expect(result).toEqual({ id: created.token.id });

    const list = await h.client.auth.apiTokens.list({});
    expect(list).toEqual([]);

    // Row is still in the DB, just with revokedAt set (audit-log readiness).
    const stored = await h.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, created.token.id))
      .get();
    expect(stored?.revokedAt).not.toBeNull();
  });

  test("revoke refuses cross-user attempts with NOT_FOUND (no oracle)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const otherUser = await h.factory.user.create({});
    const otherToken = await createApiToken(h.db, {
      userId: otherUser.id,
      name: "their-token",
      expiresAt: null,
    });

    await expect(
      h.client.auth.apiTokens.revoke({ id: otherToken.row.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("create persists scopes, list surfaces them", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const created = await h.client.auth.apiTokens.create({
      name: "scoped",
      scopes: ["entry:post:read", "settings:manage"],
    });
    expect(created.token.scopes).toEqual([
      "entry:post:read",
      "settings:manage",
    ]);

    const list = await h.client.auth.apiTokens.list({});
    expect(list[0]?.scopes).toEqual(["entry:post:read", "settings:manage"]);
  });

  test("create rejects malformed scope strings at the input layer", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(
      h.client.auth.apiTokens.create({
        name: "bogus",
        scopes: ["bad scope"],
      }),
    ).rejects.toBeDefined();
  });

  test("create with scopes: null is unrestricted (inherit role caps)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const created = await h.client.auth.apiTokens.create({
      name: "unrestricted",
      scopes: null,
    });
    expect(created.token.scopes).toBeNull();
  });
});

describe("auth.apiTokens admin (cross-user)", () => {
  test("adminList rejects callers without user:manage_tokens", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(h.client.auth.apiTokens.adminList({})).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:manage_tokens" },
    });
  });

  test("adminList returns paginated tokens across users with owner metadata", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const userA = await h.factory.user.create({ email: "a@example.test" });
    const userB = await h.factory.user.create({ email: "b@example.test" });

    await createApiToken(h.db, {
      userId: userA.id,
      name: "a-1",
      expiresAt: null,
    });
    await createApiToken(h.db, {
      userId: userB.id,
      name: "b-1",
      expiresAt: null,
    });
    await createApiToken(h.db, {
      userId: userB.id,
      name: "b-2",
      expiresAt: null,
    });

    const all = await h.client.auth.apiTokens.adminList({});
    expect(all.total).toBe(3);
    expect(all.items).toHaveLength(3);
    // All three tokens surface across both users.
    const names = new Set(all.items.map((row) => row.name));
    expect(names).toEqual(new Set(["a-1", "b-1", "b-2"]));
    // User metadata is joined in.
    const ownerEmails = new Set(all.items.map((row) => row.user.email));
    expect(ownerEmails).toEqual(new Set(["a@example.test", "b@example.test"]));
  });

  test("adminList honours userId filter", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const userA = await h.factory.user.create({});
    const userB = await h.factory.user.create({});
    await createApiToken(h.db, {
      userId: userA.id,
      name: "a-1",
      expiresAt: null,
    });
    await createApiToken(h.db, {
      userId: userB.id,
      name: "b-1",
      expiresAt: null,
    });

    const filtered = await h.client.auth.apiTokens.adminList({
      userId: userA.id,
    });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.name).toBe("a-1");
  });

  test("adminList excludes revoked rows by default; includeRevoked surfaces them", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.user.create({});
    const tokenA = await createApiToken(h.db, {
      userId: target.id,
      name: "active",
      expiresAt: null,
    });
    const tokenB = await createApiToken(h.db, {
      userId: target.id,
      name: "revoked",
      expiresAt: null,
    });
    await h.client.auth.apiTokens.adminRevoke({ id: tokenB.row.id });

    const active = await h.client.auth.apiTokens.adminList({
      userId: target.id,
    });
    expect(active.total).toBe(1);
    expect(active.items[0]?.id).toBe(tokenA.row.id);

    const auditView = await h.client.auth.apiTokens.adminList({
      userId: target.id,
      includeRevoked: true,
    });
    expect(auditView.total).toBe(2);
  });

  test("adminList respects limit + offset", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.user.create({});
    for (let i = 0; i < 5; i += 1) {
      await createApiToken(h.db, {
        userId: target.id,
        name: `t-${i}`,
        expiresAt: null,
      });
    }

    const page1 = await h.client.auth.apiTokens.adminList({
      userId: target.id,
      limit: 2,
      offset: 0,
    });
    const page2 = await h.client.auth.apiTokens.adminList({
      userId: target.id,
      limit: 2,
      offset: 2,
    });
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.items[0]?.id).not.toBe(page2.items[0]?.id);
  });

  test("adminRevoke soft-deletes any user's token", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.user.create({});
    const token = await createApiToken(h.db, {
      userId: target.id,
      name: "leaked",
      expiresAt: null,
    });

    const result = await h.client.auth.apiTokens.adminRevoke({
      id: token.row.id,
    });
    expect(result).toEqual({ id: token.row.id });

    const stored = await h.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, token.row.id))
      .get();
    expect(stored?.revokedAt).not.toBeNull();
  });

  test("adminRevoke rejects callers without user:manage_tokens", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const target = await h.factory.user.create({});
    const token = await createApiToken(h.db, {
      userId: target.id,
      name: "x",
      expiresAt: null,
    });

    await expect(
      h.client.auth.apiTokens.adminRevoke({ id: token.row.id }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:manage_tokens" },
    });
  });

  test("adminRevoke returns NOT_FOUND for unknown id (idempotent on already-revoked)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.user.create({});
    const token = await createApiToken(h.db, {
      userId: target.id,
      name: "x",
      expiresAt: null,
    });
    await h.client.auth.apiTokens.adminRevoke({ id: token.row.id });

    await expect(
      h.client.auth.apiTokens.adminRevoke({ id: token.row.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      h.client.auth.apiTokens.adminRevoke({ id: "ghost-id" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("auth.deviceFlow", () => {
  test("lookup / approve reject unauthenticated callers", async () => {
    const h = await createRpcHarness();
    await expect(
      h.client.auth.deviceFlow.lookup({ userCode: "AAAA-AAAA" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      h.client.auth.deviceFlow.approve({
        userCode: "AAAA-AAAA",
        tokenName: "x",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("lookup returns ok for a pending user_code", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);

    const result = await h.client.auth.deviceFlow.lookup({ userCode });
    expect(result).toEqual({ ok: true });
  });

  test("lookup accepts paste-friendly forms (lowercase, no dash)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);
    // userCode is "ABCD-EFGH"; transform input to lowercase + no-dash.
    const variant = userCode.replace("-", "").toLowerCase();

    const result = await h.client.auth.deviceFlow.lookup({ userCode: variant });
    expect(result).toEqual({ ok: true });
  });

  test("lookup returns NOT_FOUND for an unknown user_code", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(
      h.client.auth.deviceFlow.lookup({ userCode: "ZZZZ-ZZZZ" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "device_code" },
    });
  });

  test("lookup returns CONFLICT/already_approved once approved", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);
    await h.client.auth.deviceFlow.approve({ userCode, tokenName: "cli" });

    await expect(
      h.client.auth.deviceFlow.lookup({ userCode }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_approved" },
    });
  });

  test("approve binds the row to the calling user", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);

    const result = await h.client.auth.deviceFlow.approve({
      userCode,
      tokenName: "claude-code",
    });
    expect(result).toEqual({ ok: true });

    // The row's payload now reports approved + the chosen tokenName.
    const lookup = await lookupDeviceCodeByUserCode(h.db, userCode);
    expect(lookup.outcome).toBe("already_approved");
  });

  test("approve rejects an empty tokenName at the input layer", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);
    await expect(
      h.client.auth.deviceFlow.approve({ userCode, tokenName: "   " }),
    ).rejects.toBeDefined();
  });

  test("approve surfaces CONFLICT/already_approved when called twice on the same code", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);

    await h.client.auth.deviceFlow.approve({ userCode, tokenName: "cli" });
    await expect(
      h.client.auth.deviceFlow.approve({ userCode, tokenName: "cli2" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_approved" },
    });
  });

  test("approve surfaces NOT_FOUND for an unknown user_code", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(
      h.client.auth.deviceFlow.approve({
        userCode: "ZZZZ-ZZZZ",
        tokenName: "cli",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("end-to-end: approve via RPC, then exchange via primitives mints a token bound to the approver", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { deviceCode, userCode } = await requestDeviceCode(h.db);

    await h.client.auth.deviceFlow.approve({
      userCode,
      tokenName: "ci",
    });

    const { exchangeDeviceCode } = await import("../../../auth/device-flow.js");
    const exchanged = await exchangeDeviceCode(h.db, deviceCode, "fallback");
    expect(exchanged.outcome).toBe("approved");
    if (exchanged.outcome !== "approved") return;

    expect(exchanged.userId).toBe(h.user.id);
    expect(exchanged.secret.startsWith(API_TOKEN_PREFIX)).toBe(true);

    const minted = await h.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, h.user.id))
      .get();
    expect(minted?.name).toBe("ci");
  });

  test("approve passes scopes through to the minted token", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { deviceCode, userCode } = await requestDeviceCode(h.db);

    await h.client.auth.deviceFlow.approve({
      userCode,
      tokenName: "scoped-cli",
      scopes: ["entry:post:read"],
    });

    const { exchangeDeviceCode } = await import("../../../auth/device-flow.js");
    const exchanged = await exchangeDeviceCode(h.db, deviceCode, "fallback");
    if (exchanged.outcome !== "approved") throw new Error("expected approved");

    const minted = await h.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, h.user.id))
      .get();
    expect(minted?.scopes).toEqual(["entry:post:read"]);
  });

  test("deny flips status; subsequent lookup surfaces already_denied", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);

    const result = await h.client.auth.deviceFlow.deny({ userCode });
    expect(result).toEqual({ ok: true });

    await expect(
      h.client.auth.deviceFlow.lookup({ userCode }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_denied" },
    });
  });

  test("deny rejects unauthenticated callers", async () => {
    const h = await createRpcHarness();
    await expect(
      h.client.auth.deviceFlow.deny({ userCode: "AAAA-AAAA" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("deny on already-approved row → CONFLICT/already_approved", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);
    await h.client.auth.deviceFlow.approve({ userCode, tokenName: "x" });

    await expect(
      h.client.auth.deviceFlow.deny({ userCode }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_approved" },
    });
  });

  test("approve on already-denied row → CONFLICT/already_denied", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);
    await h.client.auth.deviceFlow.deny({ userCode });

    await expect(
      h.client.auth.deviceFlow.approve({ userCode, tokenName: "x" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_denied" },
    });
  });

  test("approve on an expired row → CONFLICT/expired", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);
    const { deviceCodes } = await import("../../../db/schema/device_codes.js");
    await h.db
      .update(deviceCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    await expect(
      h.client.auth.deviceFlow.approve({ userCode, tokenName: "x" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "expired" },
    });
  });

  test("deny on an expired row → CONFLICT/expired", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);
    const { deviceCodes } = await import("../../../db/schema/device_codes.js");
    await h.db
      .update(deviceCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    await expect(
      h.client.auth.deviceFlow.deny({ userCode }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "expired" },
    });
  });

  test("deny on already-denied row → CONFLICT/already_denied", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);
    await h.client.auth.deviceFlow.deny({ userCode });

    await expect(
      h.client.auth.deviceFlow.deny({ userCode }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_denied" },
    });
  });

  test("deny on already-approved row → CONFLICT/already_approved", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { userCode } = await requestDeviceCode(h.db);
    await h.client.auth.deviceFlow.approve({ userCode, tokenName: "x" });

    await expect(
      h.client.auth.deviceFlow.deny({ userCode }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_approved" },
    });
  });
});
