import { describe, expect, test } from "vitest";

import { eq } from "../../src/db/index.js";
import { users } from "../../src/db/schema/users.js";
import { auth } from "../../src/events-and-filters/auth.js";
import { defineAuthMethod } from "../../src/plugin/auth-method.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const fixture = defineAuthMethod({
  name: "fixture",
  label: "Fixture",
  errorCodes: ["code_expired"],
  routes: {
    start: {
      method: "POST",
      formPost: true,
      handler: async (auth) => {
        const input = (await auth.readInput()) as {
          email?: string;
          next?: string;
        } | null;
        if (typeof input?.email !== "string") return auth.fail("code_expired");
        return auth.proveIdentity(
          { email: input.email, emailVerified: true },
          { redirectTo: input.next },
        );
      },
    },
    ":email/verify": {
      method: "GET",
      handler: (auth) =>
        auth.proveIdentity({
          email: auth.params.email ?? "",
          emailVerified: true,
        }),
    },
    whoami: {
      method: "POST",
      formPost: true,
      handler: (auth) =>
        Response.json({
          hasSession: auth.ctx.authenticator.hasSession?.(auth.request) ?? null,
        }),
    },
    ping: {
      method: "POST",
      formPost: true,
      handler: (auth) => auth.notice("pinged"),
    },
  },
});

defineAuthMethod({
  name: "typo",
  label: "Typo",
  errorCodes: ["code_expired"],
  routes: {
    start: {
      method: "POST",
      // @ts-expect-error -- `fail` takes only the declared codes and the refusals
      handler: (auth) => auth.fail("code_expird"),
    },
  },
});

const fixturePlugin = definePlugin("fixture-plugin", {
  setup: () => undefined,
  authMethods: [fixture],
});

const site = await testSite({ plugins: [fixturePlugin] });
const siteWithAllowedDomain = await testSite({
  plugins: [fixturePlugin],
  config: { auth: { allowedDomains: { "example.com": "author" } } },
});
const siteWithSelfSignup = await testSite({
  plugins: [fixturePlugin],
  config: { auth: { selfSignup: { defaultRole: "author" } } },
});
const siteUnderBlog = await testSite({
  plugins: [fixturePlugin],
  config: { basePath: "/blog" },
});

/**
 * `site.visit` adds the CSRF header to every `/_plumix/` request unless one is
 * given, so a form post, which carries none, sends it empty.
 */
const NO_CSRF_HEADER = { "x-plumix-request": "" };

function fetchStart(email: string) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  } as const;
}

function formPost(
  fields: Record<string, string> = {},
  origin = "https://cms.example",
) {
  return {
    method: "POST",
    headers: {
      ...NO_CSRF_HEADER,
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
    body: new URLSearchParams(fields).toString(),
  } as const;
}

describe("a plugin's sign-in method", () => {
  test("signs a user in on an allowlisted domain", async () => {
    await siteWithAllowedDomain.factory.admin.create();

    const page = await siteWithAllowedDomain.visit(
      "/_plumix/auth/fixture/start",
      fetchStart("alice@example.com"),
    );

    expect(page.status).toBe(200);
    const body = JSON.parse(page.body) as { userId: number };
    expect(body).toEqual({ userId: body.userId, redirectTo: "/_plumix/admin" });
    expect(page.headers.get("set-cookie")).toMatch(/^plumix_session=/);
  });

  test("signs a new user up under selfSignup with its defaultRole", async () => {
    await siteWithSelfSignup.factory.admin.create();

    const page = await siteWithSelfSignup.visit(
      "/_plumix/auth/fixture/start",
      fetchStart("bob@anywhere.example"),
    );

    expect(page.status).toBe(200);
    const user = await siteWithSelfSignup.context.db.query.users.findFirst({
      where: eq(users.email, "bob@anywhere.example"),
    });
    expect(user?.role).toBe("author");
  });

  test("signs up the email exactly as the method proved it", async () => {
    await siteWithSelfSignup.factory.admin.create();

    await siteWithSelfSignup.visit(
      "/_plumix/auth/fixture/start",
      fetchStart("Bob@Anywhere.example"),
    );

    const user = await siteWithSelfSignup.context.db.query.users.findFirst({
      where: eq(users.email, "Bob@Anywhere.example"),
    });
    expect(user?.role).toBe("author");
  });

  test("refuses a domain that isn't allowed with ?fixture_error=domain_not_allowed", async () => {
    await site.factory.admin.create();

    const page = await site.visit(
      "/_plumix/auth/fixture/start",
      formPost({ email: "eve@blocked.example" }),
    );

    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe(
      "/_plumix/admin/login?fixture_error=domain_not_allowed",
    );
  });

  test("a navigation signs in with a 302 to the admin", async () => {
    await site.factory.user.create({ email: "alice@example.com" });

    const page = await site.visit(
      "/_plumix/auth/fixture/alice@example.com/verify",
      { headers: NO_CSRF_HEADER },
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/_plumix/admin");
    expect(page.headers.get("set-cookie")).toMatch(/^plumix_session=/);
  });

  test("a same-site form post signs in with a 303 to the admin", async () => {
    await site.factory.user.create({ email: "alice@example.com" });

    const page = await site.visit(
      "/_plumix/auth/fixture/start",
      formPost({ email: "alice@example.com" }),
    );

    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe("/_plumix/admin");
    expect(page.headers.get("set-cookie")).toMatch(/^plumix_session=/);
  });

  test("a fetch's failure answers JSON with the code", async () => {
    const page = await site.visit("/_plumix/auth/fixture/start", {
      method: "POST",
      body: "not json",
    });

    expect(page.status).toBe(400);
    expect(JSON.parse(page.body)).toEqual({ error: "code_expired" });
  });

  test("a cross-origin form post is refused as csrf_origin_mismatch", async () => {
    const page = await site.visit(
      "/_plumix/auth/fixture/start",
      formPost({ email: "alice@example.com" }, "https://evil.example"),
    );

    expect(page.status).toBe(403);
    expect(JSON.parse(page.body)).toMatchObject({
      reason: "csrf_origin_mismatch",
    });
  });

  test("a form post runs with no ambient session", async () => {
    const page = await site
      .actingAs("admin")
      .visit("/_plumix/auth/fixture/whoami", formPost());

    expect(JSON.parse(page.body)).toEqual({ hasSession: false });
  });

  test("a fetch keeps its ambient session", async () => {
    const page = await site
      .actingAs("admin")
      .visit("/_plumix/auth/fixture/whoami", { method: "POST" });

    expect(JSON.parse(page.body)).toEqual({ hasSession: true });
  });

  test("a fetch's notice answers { ok: true }", async () => {
    const page = await site.visit("/_plumix/auth/fixture/ping", {
      method: "POST",
    });

    expect(page.status).toBe(200);
    expect(JSON.parse(page.body)).toEqual({ ok: true });
  });

  test("a form post's notice lands on loginPath?<key>_<name>=1", async () => {
    const page = await site.visit("/_plumix/auth/fixture/ping", formPost());

    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe(
      "/_plumix/admin/login?fixture_pinged=1",
    );
  });

  test("a matched path called with the wrong verb answers 405 with Allow", async () => {
    const page = await site.visit("/_plumix/auth/fixture/start", {
      headers: NO_CSRF_HEADER,
    });

    expect(page.status).toBe(405);
    expect(page.headers.get("allow")).toBe("POST");
  });

  test.each([
    "/_plumix/auth/fixture/missing",
    "/_plumix/auth/fixture//verify",
    "/_plumix/auth/unknown-method/start",
  ])("an unmatched path %s answers the unknown-route 404", async (path) => {
    const page = await site.visit(path, { headers: NO_CSRF_HEADER });

    expect(page.status).toBe(404);
    expect(page.headers.get("x-plumix-hint")).toBe("unknown-plumix-route");
  });
});

describe("a sign-in method's redirectTo", () => {
  test.each([
    ["https://evil.example/", "/"],
    ["//evil.example", "/"],
    ["/../x", "/"],
    ["/account", "/account"],
  ])("from the query, %s lands on %s", async (value, expected) => {
    await site.factory.user.create({ email: "alice@example.com" });
    const query = new URLSearchParams({ redirectTo: value }).toString();

    const page = await site.visit(
      `/_plumix/auth/fixture/start?${query}`,
      fetchStart("alice@example.com"),
    );

    expect(JSON.parse(page.body)).toMatchObject({ redirectTo: expected });
  });

  test.each([
    ["https://evil.example/", "/"],
    ["/account", "/account"],
  ])("from options.redirectTo, %s lands on %s", async (value, expected) => {
    await site.factory.user.create({ email: "alice@example.com" });

    const page = await site.visit(
      "/_plumix/auth/fixture/start",
      formPost({ email: "alice@example.com", next: value }),
    );

    expect(page.headers.get("location")).toBe(expected);
  });

  test.each([
    ["/other", "/blog/"],
    ["/blog/account", "/blog/account"],
  ])("under base path /blog, %s lands on %s", async (value, expected) => {
    await siteUnderBlog.factory.user.create({ email: "alice@example.com" });
    const query = new URLSearchParams({ redirectTo: value }).toString();

    const page = await siteUnderBlog.visit(
      `/blog/_plumix/auth/fixture/alice@example.com/verify?${query}`,
    );

    expect(page.headers.get("location")).toBe(expected);
  });

  test("an empty ?redirectTo= lands on the admin, not the site root", async () => {
    await site.factory.user.create({ email: "alice@example.com" });

    const page = await site.visit(
      "/_plumix/auth/fixture/start?redirectTo=",
      fetchStart("alice@example.com"),
    );

    expect(JSON.parse(page.body)).toMatchObject({
      redirectTo: "/_plumix/admin",
    });
  });

  test("with none, a sign-in under /blog lands on the admin", async () => {
    await siteUnderBlog.factory.user.create({ email: "alice@example.com" });

    const page = await siteUnderBlog.visit(
      "/blog/_plumix/auth/fixture/alice@example.com/verify",
    );

    expect(page.headers.get("location")).toBe("/blog/_plumix/admin");
  });
});

const seen: { input?: unknown; signInsAtAfterSession?: number } = {};

const probe = defineAuthMethod({
  name: "probe",
  label: "Probe",
  routes: {
    input: {
      method: "POST",
      formPost: true,
      handler: async (auth) => {
        seen.input = await auth.readInput();
        return auth.notice("read");
      },
    },
    "account/:id": {
      method: "POST",
      handler: (method) =>
        method.proveIdentity(
          { userId: Number(method.params.id) },
          {
            afterSession: () => {
              seen.signInsAtAfterSession = probeSite.events.emitted(
                auth.signedIn,
              ).length;
            },
          },
        ),
    },
  },
});

const probeSite = await testSite({
  plugins: [
    definePlugin("probe-plugin", {
      setup: () => undefined,
      authMethods: [probe],
    }),
  ],
});

describe("a sign-in method's kernel", () => {
  test("reads a form post's urlencoded fields as strings", async () => {
    await probeSite.visit("/_plumix/auth/probe/input", {
      method: "POST",
      headers: {
        ...NO_CSRF_HEADER,
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://cms.example",
      },
      body: "email=a%40b.example&redirectTo=%2Faccount",
    });

    expect(seen.input).toEqual({
      email: "a@b.example",
      redirectTo: "/account",
    });
  });

  test("reads a multipart form post's fields and drops its files", async () => {
    const body = new FormData();
    body.set("email", "a@b.example");
    body.set("upload", new File(["x"], "x.txt"));

    await probeSite.visit("/_plumix/auth/probe/input", {
      method: "POST",
      headers: { ...NO_CSRF_HEADER, origin: "https://cms.example" },
      body,
    });

    expect(seen.input).toEqual({ email: "a@b.example" });
  });

  test("reads a fetch's JSON body", async () => {
    await probeSite.visit("/_plumix/auth/probe/input", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.example" }),
    });

    expect(seen.input).toEqual({ email: "a@b.example" });
  });

  test("reads null when the body doesn't parse", async () => {
    await probeSite.visit("/_plumix/auth/probe/input", {
      method: "POST",
      body: "not json",
    });

    expect(seen.input).toBeNull();
  });

  test("runs afterSession after the session exists and before auth.signedIn", async () => {
    const user = await probeSite.factory.user.create({
      email: "alice@example.com",
    });

    const page = await probeSite.visit(
      `/_plumix/auth/probe/account/${user.id}`,
      {
        method: "POST",
      },
    );

    expect(page.headers.get("set-cookie")).toMatch(/^plumix_session=/);
    expect(seen.signInsAtAfterSession).toBe(0);
    expect(probeSite.events.emitted(auth.signedIn)).toMatchObject([
      { user: { id: user.id }, method: "probe", firstSignIn: false },
    ]);
  });

  test("an account proof signs in the user it names, not the first user", async () => {
    await probeSite.factory.user.create({ email: "alice@example.com" });
    const bob = await probeSite.factory.user.create({
      email: "bob@example.com",
    });

    const page = await probeSite.visit(
      `/_plumix/auth/probe/account/${bob.id}`,
      {
        method: "POST",
      },
    );

    expect(JSON.parse(page.body)).toMatchObject({ userId: bob.id });
  });

  test("refuses an account proof whose user is gone as 403 link_broken", async () => {
    const page = await probeSite.visit("/_plumix/auth/probe/account/987654", {
      method: "POST",
    });

    expect(page.status).toBe(403);
    expect(JSON.parse(page.body)).toEqual({ error: "link_broken" });
  });

  test("refuses an account proof for a disabled user as 403 account_disabled", async () => {
    const user = await probeSite.factory.user.create({
      disabledAt: new Date(),
    });

    const page = await probeSite.visit(
      `/_plumix/auth/probe/account/${user.id}`,
      {
        method: "POST",
      },
    );

    expect(page.status).toBe(403);
    expect(page.headers.get("set-cookie")).toBeNull();
    expect(JSON.parse(page.body)).toEqual({ error: "account_disabled" });
  });
});
