import { describe, expect, test } from "vitest";

import { SESSION_COOKIE_NAME } from "../../src/auth/cookies.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

/** Reads the session with a cookie whose token no session row holds. */
function sessionWithUnknownCookie() {
  return site.visit("/_plumix/rpc/auth/session", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=not-a-real-token`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: {} }),
  });
}

describe("the session", () => {
  test("on a site with no users, has no user and needs bootstrapping", async () => {
    const session = await site.rpc.auth.session({});

    expect(session).toEqual({ user: null, needsBootstrap: true });
  });

  test("for a visitor on a site with users, has no user and needs no bootstrapping", async () => {
    await site.factory.user.create({ email: "someone@example.test" });

    const session = await site.rpc.auth.session({});

    expect(session).toEqual({ user: null, needsBootstrap: false });
  });

  test("for a signed-in admin, holds their profile and capabilities", async () => {
    const admin = await site.factory.admin.create();

    const session = await site.actingAs(admin).rpc.auth.session({});

    expect(session.needsBootstrap).toBe(false);
    expect(session.user).toMatchObject({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      avatarUrl: admin.avatarUrl,
      role: "admin",
    });
    // Admin role grants every core capability — spot-check the set covers
    // read/write gates the admin UI will actually query.
    expect(session.user?.capabilities).toEqual(
      expect.arrayContaining([
        "entry:post:read",
        "entry:post:edit_any",
        "user:list",
        "settings:manage",
      ]),
    );
  });

  test("for a member, holds only the low-privilege capabilities", async () => {
    const session = await site.actingAs("member").rpc.auth.session({});

    expect(session.user?.capabilities).toEqual([
      "entry:post:read",
      "user:edit_own",
    ]);
  });

  test("with an unknown session cookie on a site with no users, has no user and needs bootstrapping", async () => {
    const page = await sessionWithUnknownCookie();

    page.assertJson({ json: { user: null, needsBootstrap: true } });
  });

  test("with an unknown session cookie on a site with users, has no user and needs no bootstrapping", async () => {
    await site.factory.user.create({ email: "real@example.test" });

    const page = await sessionWithUnknownCookie();

    page.assertJson({ json: { user: null, needsBootstrap: false } });
  });
});

const shop = definePlugin("shop", {
  setup: (ctx) => {
    // Plugin-registered entry type with its own capability namespace —
    // surfaces on the session…
    ctx.registerEntryType("product", {
      label: "Product",
      capabilityType: "product",
    });
    // …AND an entry type that shares the core `post` capability namespace,
    // which used to produce duplicate `post:*` entries in the session's
    // capability list.
    ctx.registerEntryType("news", {
      label: "News",
      capabilityType: "post",
    });
  },
});

const shopSite = await testSite({ plugins: [shop] });

describe("the session on a site whose plugin registers entry types", () => {
  test("holds each type's derived capabilities once", async () => {
    const session = await shopSite.actingAs("editor").rpc.auth.session({});

    expect(session.user?.capabilities).toEqual(
      expect.arrayContaining(["entry:product:read", "entry:product:edit_any"]),
    );
    // Regression: derived `post:*` entries from the `news` type alias the core
    // capabilities — dedupe in `capabilitiesForRole` must prevent duplicate
    // wire entries.
    const capabilities = session.user?.capabilities ?? [];
    expect(new Set(capabilities).size).toBe(capabilities.length);
  });
});
