import { describe, expect, test } from "vitest";

import { createDispatcherHarness, plumixRequest } from "../test/dispatcher.js";

describe("dispatcher — routing", () => {
  test("public / returns the SSR placeholder", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(new Request("https://cms.example/"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<h1>Plumix</h1>");
  });

  test("/_plumix/admin returns 404 with admin-not-available when no assets binding is configured", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/admin", { method: "GET" }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("admin-not-available");
  });

  test("/_plumix/admin/<deep-link> serves admin index.html via the assets binding", async () => {
    const indexBody = "<!doctype html><title>admin</title>";
    const calls: Request[] = [];
    const assets = {
      fetch(request: Request): Promise<Response> {
        calls.push(request);
        return Promise.resolve(
          new Response(indexBody, {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        );
      },
    };
    const h = await createDispatcherHarness({ assets });

    const response = await h.dispatch(
      plumixRequest("/_plumix/admin/posts/new", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(indexBody);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]?.url ?? "").pathname).toBe(
      "/_plumix/admin/index.html",
    );
  });

  test("POST /_plumix/admin is rejected with 405 even when an assets binding is present", async () => {
    const assets = {
      fetch: (): Promise<Response> =>
        Promise.resolve(new Response("should-not-be-called", { status: 200 })),
    };
    const h = await createDispatcherHarness({ assets });

    const response = await h.dispatch(
      plumixRequest("/_plumix/admin/posts", { method: "POST" }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });

  test("/_plumix/admin/<asset-like-miss>.js returns 404 without serving HTML", async () => {
    const assets = {
      fetch: (): Promise<Response> =>
        Promise.resolve(new Response("should-not-be-called", { status: 200 })),
    };
    const h = await createDispatcherHarness({ assets });

    const response = await h.dispatch(
      plumixRequest("/_plumix/admin/chunks/missing-abc.js", { method: "GET" }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("admin-asset-not-found");
  });

  test("unknown /_plumix/* path returns 404", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/unknown", { method: "GET" }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("unknown-plumix-route");
  });
});

describe("dispatcher — CSRF", () => {
  test("POST /_plumix/rpc/post.list without the X-Plumix-Request header is forbidden", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/rpc/post.list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { reason?: string };
    expect(body.reason).toBe("csrf_header_missing");
  });

  // Parameterised: every /_plumix/auth/* POST must enforce the custom-header
  // CSRF check. Loss-of-coverage here would silently re-open cross-origin
  // attacks against register/login flows.
  const authEndpoints = [
    "/_plumix/auth/passkey/register/options",
    "/_plumix/auth/passkey/register/verify",
    "/_plumix/auth/passkey/login/options",
    "/_plumix/auth/passkey/login/verify",
    "/_plumix/auth/invite/register/options",
    "/_plumix/auth/invite/register/verify",
    "/_plumix/auth/signout",
  ] as const;

  for (const path of authEndpoints) {
    test(`POST ${path} without the CSRF header is forbidden`, async () => {
      const h = await createDispatcherHarness();
      const response = await h.dispatch(
        new Request(`https://cms.example${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      );
      expect(response.status).toBe(403);
      const body = (await response.json()) as { reason?: string };
      expect(body.reason).toBe("csrf_header_missing");
    });
  }

  test("GET /_plumix/admin is allowed without the CSRF header (safe method)", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/admin", { method: "GET" }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("admin-not-available");
  });

  test("POST with a mismatched Origin header is forbidden (origin fallback)", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/rpc/post/list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({ json: {} }),
      }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { reason?: string };
    expect(body.reason).toBe("csrf_origin_mismatch");
  });

  test("POST with a matching Origin header passes through to the RPC layer", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/rpc/post/list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://cms.example",
        },
        body: JSON.stringify({ json: {} }),
      }),
    );
    // 401 rather than 403 — CSRF passes, then the auth check rejects the
    // unauthenticated request.
    expect(response.status).toBe(401);
  });

  test("POST without an Origin header is unaffected by the origin fallback", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/rpc/post/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe("dispatcher — RPC", () => {
  test("POST /_plumix/rpc/post/list with CSRF header dispatches to oRPC (UNAUTHORIZED without session)", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/rpc/post/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
    );
    expect(response.status).toBe(401);
  });

  test("POST /_plumix/rpc/unknown/procedure with CSRF header returns 404", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/rpc/unknown/procedure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe(
      "rpc-procedure-not-found",
    );
  });
});

describe("dispatcher — auth routes", () => {
  test("POST signout without session still returns 200 and clears cookie", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  test("GET /_plumix/auth/signout is 405 (POST-only)", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", { method: "GET" }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  test("unknown auth path returns 404", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/nonexistent", { method: "POST" }),
    );
    expect(response.status).toBe(404);
  });
});

describe("dispatcher — error boundary", () => {
  test("unhandled handler exceptions return 500 JSON (no raw throw)", async () => {
    const h = await createDispatcherHarness();
    h.app.hooks.addFilter("rpc:post.list:input", () => {
      throw new Error("boom");
    });

    const user = await h.seedUser("admin");
    const authed = await h.authenticateRequest(
      plumixRequest("/_plumix/rpc/post/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
      user.id,
    );
    const response = await h.dispatch(authed);
    expect(response.status).toBe(500);
  });
});
