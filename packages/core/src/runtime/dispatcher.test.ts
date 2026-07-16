import { describe, expect, test, vi } from "vitest";

import type { RegisteredRawRoute } from "../plugin/manifest.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness, plumixRequest } from "../test/dispatcher.js";
import { matchPluginRawRoute } from "./dispatcher.js";

// Track when the dispatcher dynamic-imports the MCP module: the factory runs
// once on first import, so `loadCount` is the no-load assertion for the
// disabled path. Nothing else in this file imports the module — so the
// disabled test must run before the enabled one for `loadCount === 0` to hold.
const mcpMock = vi.hoisted(() => ({
  loadCount: 0,
  handleMcpRequest: vi.fn(() => new Response("mcp-ok", { status: 200 })),
}));
vi.mock("../mcp/dispatch.js", () => {
  mcpMock.loadCount += 1;
  return { handleMcpRequest: mcpMock.handleMcpRequest };
});

function mcpRequest(): Request {
  return new Request("https://cms.example/_plumix/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

// Same no-load assertion for the REST surface: the factory runs once on first
// import, so the disabled test (which must precede the enabled one) sees zero.
const restMock = vi.hoisted(() => ({
  loadCount: 0,
  dispatch: vi.fn(() => new Response("rest-ok", { status: 200 })),
}));
vi.mock("../rest/build-handler.js", () => {
  restMock.loadCount += 1;
  return { buildRestDispatcher: () => restMock.dispatch };
});

describe("dispatcher — REST API enablement gate", () => {
  test("the REST API is disabled by default: GET /_plumix/api/v1/posts returns 404 without loading the REST module", async () => {
    const h = await createDispatcherHarness();

    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/api/v1/posts"),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("api-disabled");
    expect(restMock.loadCount).toBe(0);
    expect(restMock.dispatch).not.toHaveBeenCalled();
  });

  test("api.enabled imports the REST module once and delegates to its dispatcher", async () => {
    const h = await createDispatcherHarness({ api: { enabled: true } });

    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/api/v1/posts"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("rest-ok");
    expect(restMock.loadCount).toBe(1);
    expect(restMock.dispatch).toHaveBeenCalledOnce();
  });
});

describe("dispatcher — MCP enablement gate", () => {
  test("MCP is disabled by default: POST /_plumix/mcp returns 404 without loading the MCP module", async () => {
    const h = await createDispatcherHarness();

    const response = await h.dispatch(mcpRequest());

    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("mcp-disabled");
    expect(mcpMock.loadCount).toBe(0);
    expect(mcpMock.handleMcpRequest).not.toHaveBeenCalled();
  });

  test("mcp.enabled imports the MCP module once and delegates to its handler", async () => {
    const h = await createDispatcherHarness({ mcp: { enabled: true } });

    const response = await h.dispatch(mcpRequest());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("mcp-ok");
    expect(mcpMock.loadCount).toBe(1);
    expect(mcpMock.handleMcpRequest).toHaveBeenCalledOnce();
  });
});

describe("dispatcher — routing", () => {
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
      plumixRequest("/_plumix/admin/entries/new", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(indexBody);
    expect(calls).toHaveLength(1);
    // Fetch the admin prefix itself (which the assets binding maps to
    // index.html with a 200) rather than `${PREFIX}/index.html` —
    // miniflare's `single-page-application` not_found_handling
    // redirects /index.html → /, breaking SPA deep links.
    expect(new URL(calls[0]?.url ?? "").pathname).toBe("/_plumix/admin/");
  });

  test("POST /_plumix/admin is rejected with 405 even when an assets binding is present", async () => {
    const assets = {
      fetch: (): Promise<Response> =>
        Promise.resolve(new Response("should-not-be-called", { status: 200 })),
    };
    const h = await createDispatcherHarness({ assets });

    const response = await h.dispatch(
      plumixRequest("/_plumix/admin/entries", { method: "POST" }),
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

  test("authenticated GET /_plumix/admin rewrites <html lang dir> to user.meta.locale", async () => {
    const assets = htmlAssets(
      '<!doctype html><html lang="en"><head></head><body></body></html>',
    );
    const h = await createDispatcherHarness({
      assets,
      i18n: { defaultLocale: "en", locales: ["en", "ar"] },
    });
    const admin = await h.factory.user.create({
      role: "admin",
      meta: { locale: "ar" },
    });

    const request = await h.authenticateRequest(
      plumixRequest("/_plumix/admin/", { method: "GET" }),
      admin.id,
    );
    const response = await h.dispatch(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<html lang="ar" dir="rtl">');
  });

  test("anonymous GET /_plumix/admin honors Accept-Language for first-time visitors (3-tier matcher)", async () => {
    const assets = htmlAssets(
      '<!doctype html><html lang="en"><head></head><body></body></html>',
    );
    const h = await createDispatcherHarness({
      assets,
      i18n: { defaultLocale: "en", locales: ["en", "zh-TW"] },
    });

    const response = await h.dispatch(
      plumixRequest("/_plumix/admin/", {
        method: "GET",
        headers: { "accept-language": "zh-Hant,en;q=0.5" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<html lang="zh-TW" dir="ltr">');
  });

  test("admin shell rewrite strips upstream body-shape headers (encoding / length / transfer-encoding / etag) — body no longer matches", async () => {
    const indexBody =
      '<!doctype html><html lang="en"><head></head><body></body></html>';
    const assets = {
      fetch: (): Promise<Response> =>
        Promise.resolve(
          new Response(indexBody, {
            status: 200,
            headers: {
              "content-type": "text/html",
              "content-encoding": "gzip",
              "content-length": String(indexBody.length),
              "transfer-encoding": "chunked",
              etag: '"upstream-original"',
            },
          }),
        ),
    };
    const h = await createDispatcherHarness({ assets });

    const response = await h.dispatch(
      plumixRequest("/_plumix/admin/", { method: "GET" }),
    );

    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("transfer-encoding")).toBeNull();
    expect(response.headers.get("etag")).toBeNull();
    // content-type must survive — browser uses it to parse the new body.
    expect(response.headers.get("content-type")).toBe("text/html");
  });

  test("admin shell response sets cache-control + vary so locale-varying body isn't shared-cached", async () => {
    const assets = htmlAssets(
      '<!doctype html><html lang="en"><head></head><body></body></html>',
    );
    const h = await createDispatcherHarness({ assets });

    const response = await h.dispatch(
      plumixRequest("/_plumix/admin/", { method: "GET" }),
    );

    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    const vary = response.headers.get("vary")?.toLowerCase() ?? "";
    expect(vary).toContain("cookie");
    expect(vary).toContain("accept-language");
  });

  test("admin shell does NOT invoke the authenticator when only a Bearer token is present (no api_tokens.lastUsedAt bump)", async () => {
    let authenticated = false;
    const assets = htmlAssets(
      '<!doctype html><html lang="en"><head></head><body></body></html>',
    );
    const h = await createDispatcherHarness({
      assets,
      authenticator: {
        authenticate: () => {
          authenticated = true;
          return Promise.resolve(null);
        },
      },
    });

    const response = await h.dispatch(
      plumixRequest("/_plumix/admin/", {
        method: "GET",
        headers: { authorization: "Bearer pl_pat_irrelevant" },
      }),
    );

    expect(response.status).toBe(200);
    expect(authenticated).toBe(false);
  });
});

function htmlAssets(body: string): { fetch: () => Promise<Response> } {
  return {
    fetch: (): Promise<Response> =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
  };
}

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
      plumixRequest("/_plumix/rpc/entry/list", {
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

  test("dev localhost CSRF: any loopback origin is allowed when the app opts in", async () => {
    const h = await createDispatcherHarness({ devCsrfLocalhost: true });
    for (const origin of [
      "http://localhost:5174",
      "http://127.0.0.1:8787",
      "http://127.0.0.2:8787",
      "http://[::1]:5173",
    ]) {
      const response = await h.dispatch(
        plumixRequest("/_plumix/rpc/entry/list", {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({ json: {} }),
        }),
      );
      expect(response.status, origin).not.toBe(403);
    }
  });

  test("dev localhost CSRF: the relaxation cannot bypass the header gate", async () => {
    const h = await createDispatcherHarness({ devCsrfLocalhost: true });
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/rpc/entry/list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5174",
        },
        body: JSON.stringify({ json: {} }),
      }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { reason?: string };
    expect(body.reason).toBe("csrf_header_missing");
  });

  test("dev localhost CSRF: non-localhost origins still mismatch", async () => {
    const h = await createDispatcherHarness({ devCsrfLocalhost: true });
    const response = await h.dispatch(
      plumixRequest("/_plumix/rpc/entry/list", {
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

  test("without the dev opt-in, a localhost origin still mismatches", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/rpc/entry/list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5174",
        },
        body: JSON.stringify({ json: {} }),
      }),
    );
    expect(response.status).toBe(403);
  });

  test("POST with a matching Origin header passes through to the RPC layer", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/rpc/entry/list", {
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
      plumixRequest("/_plumix/rpc/entry/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
    );
    expect(response.status).toBe(401);
  });

  test("same-origin POST is allowed even when the deploy host differs from app.origin", async () => {
    // The demo sandbox (and any multi-domain deploy) is served on a host that
    // isn't the canonical app.origin. A same-origin request — Origin equals the
    // host it targets — is never cross-site forgery, so it must clear the
    // origin check; only the header gate (satisfied) and auth then apply.
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("https://demo.deploy.example/_plumix/rpc/entry/list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://demo.deploy.example",
        },
        body: JSON.stringify({ json: {} }),
      }),
    );
    // 401 (auth), not 403 (CSRF) — the same-origin request clears the check.
    expect(response.status).toBe(401);
  });

  test("cross-origin POST to a non-canonical host is still forbidden", async () => {
    // The same-origin allowance must not widen the check: a forged Origin that
    // differs from both the target host and app.origin is still rejected, even
    // with the CSRF header present.
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("https://demo.deploy.example/_plumix/rpc/entry/list", {
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
});

describe("dispatcher — RPC", () => {
  test("POST /_plumix/rpc/entry/list with CSRF header dispatches to oRPC (UNAUTHORIZED without session)", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/rpc/entry/list", {
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
  test("public GET resolves a plugin-registered single-post route", async () => {
    const blog = definePlugin("test-blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    });
    const h = await createDispatcherHarness({ plugins: [blog] });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hello-world",
      title: "Hello World",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "First post." }],
          },
        ],
      },
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/hello-world"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    const body = await response.text();
    expect(body).toContain("<h1>Hello World</h1>");
    expect(body).toContain("<p>First post.</p>");
  });

  test("public GET 404s for an unknown slug", async () => {
    const blog = definePlugin("test-blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    });
    const h = await createDispatcherHarness({ plugins: [blog] });
    const response = await h.dispatch(
      new Request("https://cms.example/post/nope"),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("public-post-not-found");
  });

  test("public POST returns 405 (public routes are GET/HEAD-only in PR 1)", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      new Request("https://cms.example/anything", { method: "POST" }),
    );
    expect(response.status).toBe(405);
  });

  test("unhandled handler exceptions return 500 JSON (no raw throw)", async () => {
    const h = await createDispatcherHarness();
    h.app.hooks.addFilter("rpc:entry.list:input", () => {
      throw new Error("boom");
    });

    const user = await h.seedUser("admin");
    const authed = await h.authenticateRequest(
      plumixRequest("/_plumix/rpc/entry/list", {
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

describe("matchPluginRawRoute", () => {
  const route = (
    partial: Pick<RegisteredRawRoute, "pluginId" | "method" | "path">,
  ): RegisteredRawRoute => ({
    ...partial,
    auth: "public",
    handler: () => new Response("ok"),
  });

  test("exact path matches under /_plumix/<pluginId>/<path>", () => {
    const routes = [
      route({ pluginId: "media", method: "POST", path: "/upload" }),
    ];
    const match = matchPluginRawRoute(routes, "/_plumix/media/upload", "POST");
    expect(match?.route.path).toBe("/upload");
  });

  test("trailing /* matches the bare prefix and any sub-path", () => {
    const routes = [
      route({ pluginId: "media", method: "GET", path: "/storage/*" }),
    ];
    expect(
      matchPluginRawRoute(routes, "/_plumix/media/storage", "GET"),
    ).not.toBeNull();
    expect(
      matchPluginRawRoute(routes, "/_plumix/media/storage/", "GET"),
    ).not.toBeNull();
    expect(
      matchPluginRawRoute(routes, "/_plumix/media/storage/key-abc", "GET"),
    ).not.toBeNull();
    expect(
      matchPluginRawRoute(routes, "/_plumix/media/storage/a/b/c.jpg", "GET"),
    ).not.toBeNull();
  });

  test("trailing /* does not match sibling paths with the same stem", () => {
    const routes = [
      route({ pluginId: "media", method: "GET", path: "/storage/*" }),
    ];
    expect(
      matchPluginRawRoute(routes, "/_plumix/media/storages", "GET"),
    ).toBeNull();
  });

  test("method `*` matches every HTTP method", () => {
    const routes = [route({ pluginId: "media", method: "*", path: "/proxy" })];
    for (const m of ["GET", "POST", "DELETE", "PUT", "PATCH"]) {
      expect(
        matchPluginRawRoute(routes, "/_plumix/media/proxy", m),
      ).not.toBeNull();
    }
  });

  test("method match is case-insensitive on the request side", () => {
    const routes = [
      route({ pluginId: "media", method: "POST", path: "/upload" }),
    ];
    expect(
      matchPluginRawRoute(routes, "/_plumix/media/upload", "post"),
    ).not.toBeNull();
  });

  test("returns null for paths not rooted under /_plumix/<pluginId>", () => {
    const routes = [
      route({ pluginId: "media", method: "GET", path: "/upload" }),
    ];
    expect(
      matchPluginRawRoute(routes, "/_plumix/rpc/entry/list", "GET"),
    ).toBeNull();
    expect(
      matchPluginRawRoute(routes, "/_plumix/menus/upload", "GET"),
    ).toBeNull();
  });

  test("registration order breaks ties across plugins", () => {
    const first = route({ pluginId: "a", method: "GET", path: "/*" });
    const second = route({ pluginId: "b", method: "GET", path: "/*" });
    const match = matchPluginRawRoute(
      [first, second],
      "/_plumix/a/anything",
      "GET",
    );
    expect(match?.route.pluginId).toBe("a");
  });
});

describe("dispatcher — plugin raw routes", () => {
  test("public GET route is dispatched without a session", async () => {
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerRoute({
        method: "GET",
        path: "/ping",
        auth: "public",
        handler: () => new Response("pong", { status: 200 }),
      });
    });
    const h = await createDispatcherHarness({ plugins: [plugin] });

    const response = await h.dispatch(
      plumixRequest("/_plumix/media/ping", { method: "GET" }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("pong");
  });

  test("authenticated route rejects anonymous requests with 401", async () => {
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerRoute({
        method: "POST",
        path: "/upload",
        auth: "authenticated",
        handler: () => new Response("ok"),
      });
    });
    const h = await createDispatcherHarness({ plugins: [plugin] });

    const response = await h.dispatch(
      plumixRequest("/_plumix/media/upload", { method: "POST" }),
    );
    expect(response.status).toBe(401);
  });

  test("authenticated route dispatches when a valid session is present", async () => {
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerRoute({
        method: "POST",
        path: "/upload",
        auth: "authenticated",
        handler: (_req, c) =>
          new Response(String(c.user?.email ?? ""), { status: 200 }),
      });
    });
    const h = await createDispatcherHarness({ plugins: [plugin] });
    const user = await h.seedUser("author");
    const authed = await h.authenticateRequest(
      plumixRequest("/_plumix/media/upload", { method: "POST" }),
      user.id,
    );

    const response = await h.dispatch(authed);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(user.email);
  });

  test("capability gate returns 403 when the role is below the minimum", async () => {
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerCapability("menu:manage", "admin");
      ctx.registerRoute({
        method: "POST",
        path: "/sync",
        auth: { capability: "menu:manage" },
        handler: () => new Response("ok"),
      });
    });
    const h = await createDispatcherHarness({ plugins: [plugin] });
    const user = await h.seedUser("editor");
    const authed = await h.authenticateRequest(
      plumixRequest("/_plumix/menus/sync", { method: "POST" }),
      user.id,
    );

    const response = await h.dispatch(authed);
    expect(response.status).toBe(403);
    const body = (await response.json()) as {
      error: string;
      capability: string;
    };
    expect(body.error).toBe("forbidden");
    expect(body.capability).toBe("menu:manage");
  });

  test("capability gate dispatches when the role meets the minimum", async () => {
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerCapability("menu:manage", "admin");
      ctx.registerRoute({
        method: "POST",
        path: "/sync",
        auth: { capability: "menu:manage" },
        handler: () => new Response("ok"),
      });
    });
    const h = await createDispatcherHarness({ plugins: [plugin] });
    const user = await h.seedUser("admin");
    const authed = await h.authenticateRequest(
      plumixRequest("/_plumix/menus/sync", { method: "POST" }),
      user.id,
    );

    const response = await h.dispatch(authed);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  test("plugin raw routes inherit the dispatcher-level CSRF gate on write methods", async () => {
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerRoute({
        method: "POST",
        path: "/upload",
        auth: "public",
        handler: () => new Response("ok"),
      });
    });
    const h = await createDispatcherHarness({ plugins: [plugin] });

    // Request without the custom CSRF header is rejected by the shared
    // /_plumix/* gate before the route even runs.
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/media/upload", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as {
      error: string;
      reason: string;
    };
    expect(body.reason).toBe("csrf_header_missing");
  });

  test("an unknown /_plumix/<pluginId>/* path still returns unknown-plumix-route", async () => {
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerRoute({
        method: "GET",
        path: "/known",
        auth: "public",
        handler: () => new Response("ok"),
      });
    });
    const h = await createDispatcherHarness({ plugins: [plugin] });

    const response = await h.dispatch(
      plumixRequest("/_plumix/media/unknown", { method: "GET" }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("unknown-plumix-route");
  });
});

describe("dispatcher — basePath (served under a subdirectory)", () => {
  const blog = definePlugin("test-blog", (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  });

  test("a public route under the base path renders; the bare path 404s", async () => {
    const h = await createDispatcherHarness({
      basePath: "/custom-directory",
      plugins: [blog],
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hello-world",
      title: "Hello World",
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const underBase = await h.dispatch(
      new Request("https://cms.example/custom-directory/post/hello-world"),
    );
    expect(underBase.status).toBe(200);
    expect(await underBase.text()).toContain("<h1>Hello World</h1>");

    // The same path WITHOUT the prefix isn't part of the mounted site.
    const bare = await h.dispatch(
      new Request("https://cms.example/post/hello-world"),
    );
    expect(bare.status).toBe(404);
  });

  test("the front page is served at the bare base prefix", async () => {
    const h = await createDispatcherHarness({ basePath: "/custom-directory" });
    const response = await h.dispatch(
      new Request("https://cms.example/custom-directory/"),
    );
    expect(response.status).toBe(200);
  });

  test("the sitemap index lists base-prefixed sub-sitemap URLs", async () => {
    const h = await createDispatcherHarness({
      basePath: "/custom-directory",
      plugins: [blog],
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hello-world",
      title: "Hello World",
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/custom-directory/sitemap.xml"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain(
      "https://cms.example/custom-directory/sitemap-post-1.xml",
    );
  });

  test("the feed advertises base-prefixed entry links and a base-prefixed self URL", async () => {
    const h = await createDispatcherHarness({
      basePath: "/custom-directory",
      plugins: [blog],
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hello-world",
      title: "Hello World",
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/custom-directory/feed"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain(
      "https://cms.example/custom-directory/post/hello-world",
    );
    expect(body).toContain("https://cms.example/custom-directory/feed");
  });

  test("admin/RPC surfaces stay reachable under the base prefix", async () => {
    const h = await createDispatcherHarness({ basePath: "/custom-directory" });
    const response = await h.dispatch(
      plumixRequest("/custom-directory/_plumix/rpc/entry/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
    );
    // 401 (not 404): the strip exposed the RPC route, then auth rejected it.
    expect(response.status).toBe(401);
  });

  test("the admin shell injects a base-prefixed <base href> so the SPA resolves assets under the mount", async () => {
    const assets = htmlAssets(
      '<!doctype html><html lang="en"><head></head><body></body></html>',
    );
    const h = await createDispatcherHarness({
      basePath: "/custom-directory",
      assets,
    });

    const response = await h.dispatch(
      plumixRequest("/custom-directory/_plumix/admin/", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      '<base href="/custom-directory/_plumix/admin/">',
    );
  });

  test("admin asset requests under the base are served from the binding at the stripped path", async () => {
    const calls: string[] = [];
    const assets = {
      fetch(request: Request): Promise<Response> {
        calls.push(new URL(request.url).pathname);
        return Promise.resolve(
          new Response("console.log(1)", {
            status: 200,
            headers: { "content-type": "text/javascript" },
          }),
        );
      },
    };
    const h = await createDispatcherHarness({
      basePath: "/custom-directory",
      assets,
    });

    const response = await h.dispatch(
      plumixRequest("/custom-directory/_plumix/admin/assets/index-abc.js", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("console.log(1)");
    // The binding is hit at the root-relative asset path, not the prefixed one.
    expect(calls).toContain("/_plumix/admin/assets/index-abc.js");
  });

  test("the session cookie is scoped to the base so it isn't sent to sibling apps", async () => {
    const h = await createDispatcherHarness({ basePath: "/custom-directory" });
    const response = await h.dispatch(
      plumixRequest("/custom-directory/_plumix/auth/signout", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "Path=/custom-directory",
    );
  });
});

describe("dispatcher — imageDelivery slot wiring", () => {
  test("ctx.imageDelivery is exposed to plugin route handlers when configured", async () => {
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerRoute({
        method: "GET",
        path: "/transform",
        auth: "public",
        handler: (req, c) => {
          const url = new URL(req.url);
          const src = url.searchParams.get("src") ?? "";
          const w = url.searchParams.get("w");
          const transformed =
            c.imageDelivery?.url(src, w ? { width: Number(w) } : undefined) ??
            "no-delivery";
          return new Response(transformed, { status: 200 });
        },
      });
    });
    const h = await createDispatcherHarness({
      plugins: [plugin],
      imageDelivery: {
        kind: "stub",
        url: (src, opts) =>
          opts?.width === undefined ? src : `${src}?w=${opts.width}`,
      },
    });

    const response = await h.dispatch(
      plumixRequest(
        "/_plumix/media/transform?src=https://media.example/cat.jpg&w=400",
        { method: "GET" },
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("https://media.example/cat.jpg?w=400");
  });

  test("ctx.imageDelivery is undefined when no slot is configured", async () => {
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerRoute({
        method: "GET",
        path: "/probe",
        auth: "public",
        handler: (_req, c) =>
          new Response(c.imageDelivery === undefined ? "absent" : "present", {
            status: 200,
          }),
      });
    });
    const h = await createDispatcherHarness({ plugins: [plugin] });

    const response = await h.dispatch(
      plumixRequest("/_plumix/media/probe", { method: "GET" }),
    );
    expect(await response.text()).toBe("absent");
  });
});

describe("dispatcher — public read-through edge cache", () => {
  function cacheStub(hit?: Response) {
    const match = vi.fn(() => Promise.resolve(hit));
    const put = vi.fn(() => Promise.resolve());
    const purgeTags = vi.fn(() => Promise.resolve());
    return { cache: { match, put, purgeTags }, match, put };
  }

  test("a cacheable public GET is served from the edge cache on a hit", async () => {
    const { cache, match } = cacheStub(new Response("CACHED", { status: 200 }));
    const h = await createDispatcherHarness({ cache });

    const response = await h.dispatch(new Request("https://cms.example/"));

    expect(await response.text()).toBe("CACHED");
    expect(match).toHaveBeenCalledOnce();
  });

  test("a cacheable public GET stores the rendered response on a miss", async () => {
    const { cache, put } = cacheStub();
    const h = await createDispatcherHarness({ cache });

    await h.dispatch(new Request("https://cms.example/"));

    expect(put).toHaveBeenCalledOnce();
  });

  test("a request carrying the session cookie bypasses the cache", async () => {
    const { cache, match } = cacheStub(new Response("CACHED", { status: 200 }));
    const h = await createDispatcherHarness({ cache });

    const response = await h.dispatch(
      new Request("https://cms.example/", {
        headers: { cookie: "plumix_session=anything" },
      }),
    );

    expect(await response.text()).not.toBe("CACHED");
    expect(match).not.toHaveBeenCalled();
  });

  test("a request carrying a ?preview= draft grant bypasses the cache", async () => {
    const { cache, match } = cacheStub(new Response("CACHED", { status: 200 }));
    const h = await createDispatcherHarness({ cache });

    const response = await h.dispatch(
      new Request("https://cms.example/?preview=some-token"),
    );

    expect(await response.text()).not.toBe("CACHED");
    expect(match).not.toHaveBeenCalled();
  });
});
