import { describe, expect, test } from "vitest";

import type { RequestAuthenticator } from "../../src/context/authenticator.js";
import { SESSION_COOKIE_NAME } from "../../src/auth/cookies.js";
import { sessions } from "../../src/db/schema/sessions.js";
import { auth } from "../../src/events-and-filters/auth.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });
const siteUnderCustomDirectory = await testSite({
  config: { basePath: "/custom-directory" },
});
const siteUnderBlog = await testSite({ config: { basePath: "/blog" } });

/** An external IdP that owns the session and signs out at its own URL. */
function idpSignOutAt(
  signOutUrl: RequestAuthenticator["signOutUrl"],
): RequestAuthenticator {
  return { authenticate: () => Promise.resolve(null), signOutUrl };
}

const behindAnIdp = await testSite({
  config: {
    auth: {
      authenticator: idpSignOutAt(() => "https://idp.example/logout"),
    },
  },
});
const behindAnIdpSession = await testSite({
  config: {
    auth: {
      authenticator: idpSignOutAt((request) =>
        request.headers.has("x-idp-session")
          ? "https://idp.example/logout"
          : null,
      ),
    },
  },
});
const behindALocalSignOutPage = await testSite({
  config: {
    auth: { authenticator: idpSignOutAt(() => "/_plumix/admin/login") },
  },
});
const unsafeSignOutUrls = [
  ["javascript scheme", "javascript:alert(1)"],
  ["data scheme", "data:text/html,<script>"],
  ["protocol-relative", "//attacker.example/logout"],
  ["plain http", "http://insecure.example/logout"],
  ["relative path", "logout"],
  ["CR injection", "https://idp.example/logout\r\nset-cookie: x=y"],
  ["empty string", ""],
] as const;
const behindAnUnsafeSignOutUrl = await Promise.all(
  unsafeSignOutUrls.map(([name, url]) =>
    testSite({
      config: { auth: { authenticator: idpSignOutAt(() => url) } },
    }).then((unsafe) => [name, unsafe] as const),
  ),
);

const POST = { method: "POST" } as const;
/**
 * `site.visit` adds the CSRF header only under `/_plumix/`, so a request under
 * a basePath carries it itself, as the auth client's fetch does.
 */
const POST_UNDER_BASE_PATH = {
  method: "POST",
  headers: { "x-plumix-request": "1" },
} as const;

/**
 * A sign-out form posted from a page. `site.visit` adds the CSRF header to
 * every `/_plumix/` request unless one is given, so a form post, which carries
 * none, sends it empty.
 */
function asForm(origin = "https://cms.example") {
  return {
    method: "POST",
    headers: {
      "x-plumix-request": "",
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
  } as const;
}

describe("signing out by fetch", () => {
  test("clears the cookie even when no session exists", async () => {
    const page = await site.visit("/_plumix/auth/signout", POST);

    page.assertOk();
    const setCookie = page.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  test("under a basePath clears the cookie from the base-scoped path", async () => {
    const page = await siteUnderCustomDirectory.visit(
      "/custom-directory/_plumix/auth/signout",
      POST_UNDER_BASE_PATH,
    );

    page.assertOk();
    expect(page.headers.get("set-cookie")).toContain("Path=/custom-directory");
  });

  test("ends the caller's session", async () => {
    const page = await site
      .actingAs("admin")
      .visit("/_plumix/auth/signout", POST);

    page.assertOk();
    expect(await site.context.db.$count(sessions)).toBe(0);
  });

  test("answers a null redirectTo without an external authenticator", async () => {
    const page = await site.visit("/_plumix/auth/signout", POST);

    expect(JSON.parse(page.body)).toMatchObject({ redirectTo: null });
  });

  test("answers a custom authenticator's signOutUrl", async () => {
    const page = await behindAnIdp.visit("/_plumix/auth/signout", POST);

    page.assertOk().assertJson({ redirectTo: "https://idp.example/logout" });
  });

  // Defence in depth, in case the operator switched authenticators while
  // sessions were live.
  test("still clears the local cookie when an external IdP owns the session", async () => {
    const page = await behindAnIdp.visit("/_plumix/auth/signout", POST);

    expect(page.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("passes the sign-out request to signOutUrl", async () => {
    const page = await behindAnIdpSession.visit("/_plumix/auth/signout", {
      ...POST,
      headers: { "x-idp-session": "1" },
    });

    page.assertJson({ redirectTo: "https://idp.example/logout" });
  });

  test("answers null where signOutUrl reads nothing from the request", async () => {
    const page = await behindAnIdpSession.visit("/_plumix/auth/signout", POST);

    expect(JSON.parse(page.body)).toMatchObject({ redirectTo: null });
  });

  test.each(behindAnUnsafeSignOutUrl)(
    "drops an unsafe signOutUrl (%s) and answers null instead",
    async (_name, unsafe) => {
      const page = await unsafe.visit("/_plumix/auth/signout", POST);

      expect(JSON.parse(page.body)).toMatchObject({ redirectTo: null });
    },
  );

  test("accepts a same-origin path as signOutUrl", async () => {
    const page = await behindALocalSignOutPage.visit(
      "/_plumix/auth/signout",
      POST,
    );

    page.assertJson({ redirectTo: "/_plumix/admin/login" });
  });

  test.each([
    ["/account", "/account"],
    ["https://evil.example/", "/"],
    ["//evil.example", "/"],
    ["/../x", "/"],
  ])("answers ?redirectTo=%s with %s", async (value, expected) => {
    const page = await site.visit(
      `/_plumix/auth/signout?${new URLSearchParams({ redirectTo: value }).toString()}`,
      POST,
    );

    expect(JSON.parse(page.body)).toEqual({ ok: true, redirectTo: expected });
  });

  test("under base path /blog answers ?redirectTo=/other with /blog/", async () => {
    const page = await siteUnderBlog.visit(
      "/blog/_plumix/auth/signout?redirectTo=%2Fother",
      POST_UNDER_BASE_PATH,
    );

    expect(JSON.parse(page.body)).toEqual({ ok: true, redirectTo: "/blog/" });
  });

  test("answers a signOutUrl over ?redirectTo=", async () => {
    const page = await behindAnIdp.visit(
      "/_plumix/auth/signout?redirectTo=%2Faccount",
      POST,
    );

    expect(JSON.parse(page.body)).toEqual({
      ok: true,
      redirectTo: "https://idp.example/logout",
    });
  });
});

describe("signing out by form post", () => {
  test("lands a same-site post on ?signed_out=1, clearing the cookie", async () => {
    const page = await site
      .actingAs("admin")
      .visit("/_plumix/auth/signout", asForm());

    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe(
      "/_plumix/admin/login?signed_out=1",
    );
    expect(page.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("ends the session and emits auth.signedOut", async () => {
    await site.actingAs("admin").visit("/_plumix/auth/signout", asForm());

    expect(await site.context.db.$count(sessions)).toBe(0);
    expect(site.events.emitted(auth.signedOut)).toHaveLength(1);
  });

  test("lands on ?redirectTo=/account", async () => {
    const page = await site.visit(
      "/_plumix/auth/signout?redirectTo=%2Faccount",
      asForm(),
    );

    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe("/account");
  });

  test("lands on an authenticator's signOutUrl over ?redirectTo=", async () => {
    const page = await behindAnIdp.visit(
      "/_plumix/auth/signout?redirectTo=%2Faccount",
      asForm(),
    );

    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe("https://idp.example/logout");
  });

  test("is refused from another origin as csrf_origin_mismatch", async () => {
    const page = await site.visit(
      "/_plumix/auth/signout",
      asForm("https://evil.example"),
    );

    page.assertForbidden();
    expect(JSON.parse(page.body)).toEqual({
      error: "forbidden",
      reason: "csrf_origin_mismatch",
    });
  });
});
