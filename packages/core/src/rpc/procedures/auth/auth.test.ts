import { describe, expect, test } from "vitest";

import type { RequestAuthenticator } from "../../../auth/authenticator.js";
import { SESSION_COOKIE_NAME } from "../../../auth/cookies.js";
import { createSession } from "../../../auth/sessions.js";
import { eq } from "../../../db/index.js";
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
      authenticate: () => Promise.resolve(user),
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
    expect(rejected[0]!.reason).toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_credential" },
    });

    const after = await h.client.auth.credentials.list({});
    expect(after).toHaveLength(1);
  });
});
