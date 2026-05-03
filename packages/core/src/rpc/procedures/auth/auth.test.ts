import { describe, expect, test } from "vitest";

import { SESSION_COOKIE_NAME } from "../../../auth/cookies.js";
import { HookRegistry } from "../../../hooks/registry.js";
import { definePlugin } from "../../../plugin/define.js";
import { installPlugins } from "../../../plugin/register.js";
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
