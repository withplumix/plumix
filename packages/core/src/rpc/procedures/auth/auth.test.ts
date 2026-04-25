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
