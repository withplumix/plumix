import { describe, expect, test } from "vitest";

import type { TestConfigInput } from "../test/config.js";
import { defineAuthMethod } from "../plugin/auth-method.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

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

function fixtureSite(config: TestConfigInput = {}): TestConfigInput {
  return {
    ...config,
    plugins: [
      definePlugin("fixture-plugin", {
        setup: () => undefined,
        authMethods: [fixture],
      }),
    ],
  };
}

function fetchStart(email: string, query = ""): Request {
  return new Request(`https://cms.example/_plumix/auth/fixture/start${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-plumix-request": "1",
    },
    body: JSON.stringify({ email }),
  });
}

function formPostStart(
  fields: Record<string, string>,
  origin = "https://cms.example",
): Request {
  return new Request("https://cms.example/_plumix/auth/fixture/start", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("a plugin's sign-in method", () => {
  test("signs a user in on an allowlisted domain", async () => {
    const h = await createDispatcherHarness({ config: fixtureSite() });
    await h.seedUser("admin");
    await h.factory.allowedDomain.create({
      domain: "example.com",
      defaultRole: "author",
      isEnabled: true,
    });

    const response = await h.dispatch(fetchStart("alice@example.com"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { userId: number };
    expect(body).toEqual({ userId: body.userId, redirectTo: "/_plumix/admin" });
    expect(response.headers.get("set-cookie")).toMatch(/^plumix_session=/);
  });

  test("signs a new user up under selfSignup with its defaultRole", async () => {
    const h = await createDispatcherHarness({
      config: fixtureSite({
        auth: { selfSignup: { defaultRole: "contributor" } },
      }),
    });
    await h.seedUser("admin");

    const response = await h.dispatch(fetchStart("bob@anywhere.example"));

    expect(response.status).toBe(200);
    const user = await h.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, "bob@anywhere.example"),
    });
    expect(user?.role).toBe("contributor");
  });

  test("refuses a domain that isn't allowed with ?fixture_error=domain_not_allowed", async () => {
    const h = await createDispatcherHarness({ config: fixtureSite() });
    await h.seedUser("admin");

    const response = await h.dispatch(
      formPostStart({ email: "eve@blocked.example" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?fixture_error=domain_not_allowed",
    );
  });

  test("a navigation signs in with a 302 to the admin", async () => {
    const h = await createDispatcherHarness({ config: fixtureSite() });
    await h.factory.user.create({ email: "alice@example.com" });

    const response = await h.dispatch(
      new Request(
        "https://cms.example/_plumix/auth/fixture/alice@example.com/verify",
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/_plumix/admin");
    expect(response.headers.get("set-cookie")).toMatch(/^plumix_session=/);
  });

  test("a same-site form post signs in with a 303 to the admin", async () => {
    const h = await createDispatcherHarness({ config: fixtureSite() });
    await h.factory.user.create({ email: "alice@example.com" });

    const response = await h.dispatch(
      formPostStart({ email: "alice@example.com" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/_plumix/admin");
    expect(response.headers.get("set-cookie")).toMatch(/^plumix_session=/);
  });

  test("a fetch's failure answers JSON with the code", async () => {
    const h = await createDispatcherHarness({ config: fixtureSite() });

    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/fixture/start", {
        method: "POST",
        headers: { "x-plumix-request": "1" },
        body: "not json",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "code_expired" });
  });

  test("a cross-origin form post is refused as csrf_origin_mismatch", async () => {
    const h = await createDispatcherHarness({ config: fixtureSite() });

    const response = await h.dispatch(
      formPostStart({ email: "alice@example.com" }, "https://evil.example"),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      reason: "csrf_origin_mismatch",
    });
  });

  test("a form post runs with no ambient session", async () => {
    const h = await createDispatcherHarness({ config: fixtureSite() });
    const user = await h.seedUser("admin");
    const signedIn = await h.authenticateRequest(
      new Request("https://cms.example/_plumix/auth/fixture/whoami", {
        method: "POST",
        headers: { origin: "https://cms.example" },
      }),
      user.id,
    );

    const response = await h.dispatch(signedIn);

    expect(await response.json()).toEqual({ hasSession: false });
  });

  test("a fetch keeps its ambient session", async () => {
    const h = await createDispatcherHarness({ config: fixtureSite() });
    const user = await h.seedUser("admin");
    const signedIn = await h.authenticateRequest(
      new Request("https://cms.example/_plumix/auth/fixture/whoami", {
        method: "POST",
        headers: { "x-plumix-request": "1" },
      }),
      user.id,
    );

    const response = await h.dispatch(signedIn);

    expect(await response.json()).toEqual({ hasSession: true });
  });

  test("a fetch's notice answers { ok: true }", async () => {
    const h = await createDispatcherHarness({ config: fixtureSite() });

    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/fixture/ping", {
        method: "POST",
        headers: { "x-plumix-request": "1" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("a form post's notice lands on loginPath?<key>_<name>=1", async () => {
    const h = await createDispatcherHarness({ config: fixtureSite() });

    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/fixture/ping", {
        method: "POST",
        headers: { origin: "https://cms.example" },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?fixture_pinged=1",
    );
  });

  test("a matched path called with the wrong verb answers 405 with Allow", async () => {
    const h = await createDispatcherHarness({ config: fixtureSite() });

    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/fixture/start"),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  test.each([
    "/_plumix/auth/fixture/missing",
    "/_plumix/auth/fixture//verify",
    "/_plumix/auth/unknown-method/start",
  ])("an unmatched path %s answers the unknown-route 404", async (path) => {
    const h = await createDispatcherHarness({ config: fixtureSite() });

    const response = await h.dispatch(
      new Request(`https://cms.example${path}`),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("unknown-plumix-route");
  });
});

describe("a sign-in method's redirectTo", () => {
  test.each([
    ["https://evil.example/", "/"],
    ["//evil.example", "/"],
    ["/../x", "/"],
    ["/account", "/account"],
  ])("from the query, %s lands on %s", async (value, expected) => {
    const h = await createDispatcherHarness({ config: fixtureSite() });
    await h.factory.user.create({ email: "alice@example.com" });
    const query = `?${new URLSearchParams({ redirectTo: value }).toString()}`;

    const response = await h.dispatch(fetchStart("alice@example.com", query));

    expect(await response.json()).toMatchObject({ redirectTo: expected });
  });

  test.each([
    ["https://evil.example/", "/"],
    ["/account", "/account"],
  ])("from options.redirectTo, %s lands on %s", async (value, expected) => {
    const h = await createDispatcherHarness({ config: fixtureSite() });
    await h.factory.user.create({ email: "alice@example.com" });

    const response = await h.dispatch(
      formPostStart({ email: "alice@example.com", next: value }),
    );

    expect(response.headers.get("location")).toBe(expected);
  });

  test.each([
    ["/other", "/blog/"],
    ["/blog/account", "/blog/account"],
  ])("under base path /blog, %s lands on %s", async (value, expected) => {
    const h = await createDispatcherHarness({
      config: fixtureSite({ basePath: "/blog" }),
    });
    await h.factory.user.create({ email: "alice@example.com" });
    const query = `?${new URLSearchParams({ redirectTo: value }).toString()}`;

    const response = await h.dispatch(
      new Request(
        `https://cms.example/blog/_plumix/auth/fixture/alice@example.com/verify${query}`,
      ),
    );

    expect(response.headers.get("location")).toBe(expected);
  });

  test("with none, a sign-in under /blog lands on the admin", async () => {
    const h = await createDispatcherHarness({
      config: fixtureSite({ basePath: "/blog" }),
    });
    await h.factory.user.create({ email: "alice@example.com" });

    const response = await h.dispatch(
      new Request(
        "https://cms.example/blog/_plumix/auth/fixture/alice@example.com/verify",
      ),
    );

    expect(response.headers.get("location")).toBe("/blog/_plumix/admin");
  });
});

describe("a sign-in method's kernel", () => {
  const seen: { input?: unknown; spyCallsAtAfterSession?: number } = {};
  let spyCalls: () => number = () => 0;

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
        handler: (auth) =>
          auth.proveIdentity(
            { userId: Number(auth.params.id) },
            {
              afterSession: () => {
                seen.spyCallsAtAfterSession = spyCalls();
              },
            },
          ),
      },
    },
  });

  function probeSite(): TestConfigInput {
    return {
      plugins: [
        definePlugin("probe-plugin", {
          setup: () => undefined,
          authMethods: [probe],
        }),
      ],
    };
  }

  function probeRequest(path: string, init: RequestInit): Request {
    return new Request(`https://cms.example/_plumix/auth/probe/${path}`, init);
  }

  test("reads a form post's urlencoded fields as strings", async () => {
    const h = await createDispatcherHarness({ config: probeSite() });

    await h.dispatch(
      probeRequest("input", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://cms.example",
        },
        body: "email=a%40b.example&redirectTo=%2Faccount",
      }),
    );

    expect(seen.input).toEqual({
      email: "a@b.example",
      redirectTo: "/account",
    });
  });

  test("reads a multipart form post's fields and drops its files", async () => {
    const h = await createDispatcherHarness({ config: probeSite() });
    const body = new FormData();
    body.set("email", "a@b.example");
    body.set("upload", new File(["x"], "x.txt"));

    await h.dispatch(
      probeRequest("input", {
        method: "POST",
        headers: { origin: "https://cms.example" },
        body,
      }),
    );

    expect(seen.input).toEqual({ email: "a@b.example" });
  });

  test("reads a fetch's JSON body", async () => {
    const h = await createDispatcherHarness({ config: probeSite() });

    await h.dispatch(
      probeRequest("input", {
        method: "POST",
        headers: { "x-plumix-request": "1" },
        body: JSON.stringify({ email: "a@b.example" }),
      }),
    );

    expect(seen.input).toEqual({ email: "a@b.example" });
  });

  test("reads null when the body doesn't parse", async () => {
    const h = await createDispatcherHarness({ config: probeSite() });

    await h.dispatch(
      probeRequest("input", {
        method: "POST",
        headers: { "x-plumix-request": "1" },
        body: "not json",
      }),
    );

    expect(seen.input).toBeNull();
  });

  test("runs afterSession after the session exists and before user:signed_in", async () => {
    const h = await createDispatcherHarness({ config: probeSite() });
    const user = await h.factory.user.create({ email: "alice@example.com" });
    const spy = h.spyAction("user:signed_in");
    spyCalls = () => spy.callCount;

    const response = await h.dispatch(
      probeRequest(`account/${user.id}`, {
        method: "POST",
        headers: { "x-plumix-request": "1" },
      }),
    );

    expect(response.headers.get("set-cookie")).toMatch(/^plumix_session=/);
    expect(seen.spyCallsAtAfterSession).toBe(0);
    spy.assertCalledOnce();
    expect(spy.lastArgs?.[1]).toEqual({ method: "probe", firstSignIn: false });
  });

  test("refuses an account proof whose user is gone as 403 link_broken", async () => {
    const h = await createDispatcherHarness({ config: probeSite() });

    const response = await h.dispatch(
      probeRequest("account/987654", {
        method: "POST",
        headers: { "x-plumix-request": "1" },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "link_broken" });
  });

  test("refuses an account proof for a disabled user as 403 account_disabled", async () => {
    const h = await createDispatcherHarness({ config: probeSite() });
    const user = await h.factory.user.create({ disabledAt: new Date() });

    const response = await h.dispatch(
      probeRequest(`account/${user.id}`, {
        method: "POST",
        headers: { "x-plumix-request": "1" },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({ error: "account_disabled" });
  });
});
