import { afterEach, describe, expect, test, vi } from "vitest";

import { defineBlock } from "@plumix/blocks";

import type { AnyPluginDescriptor } from "../config.js";
import type { AppContext } from "../context/app.js";
import type {
  TelemetryConsumer,
  TelemetrySnapshot,
  TelemetrySpan,
} from "../context/telemetry.js";
import type { RegisteredRawRoute } from "../plugin/manifest.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import type { ConnectedCache } from "./slots.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { defineTemplate } from "../template.js";
import { createDispatcherHarness, plumixRequest } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";
import { matchPluginRawRoute } from "./dispatcher.js";

// Augment the registry so the typed `registerTemplateDep("probe-dep", ...)`
// call in the render-interior telemetry test compiles.
declare module "../template.js" {
  interface TemplateDepRegistry {
    "probe-dep": { slug: string; result: { value: string } };
  }
}

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

  // Extended timeout: this is the first request in the file to pass the CSRF
  // gate, so it pays `loadRpcHandler`'s one-time source-resolved import of the
  // whole oRPC router graph (~0.3s idle, 5s+ on a contended CI runner) —
  // every later RPC dispatch in the process is ~20ms.
  test(
    "dev localhost CSRF: any loopback origin is allowed when the app opts in",
    { timeout: 15_000 },
    async () => {
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
    },
  );

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

  test("with the dev opt-in explicitly off, a localhost origin still mismatches", async () => {
    // Pin the override so this doesn't ride on ambient PLUMIX_DEV (the
    // env-derived default is covered by the prod-fails-closed test below).
    const h = await createDispatcherHarness({ devCsrfLocalhost: false });
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

  test("dev-CSRF derives from PLUMIX_DEV: a loopback origin is allowed when set", async () => {
    const original = process.env.PLUMIX_DEV;
    process.env.PLUMIX_DEV = "1";
    try {
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
      expect(response.status).not.toBe(403);
    } finally {
      if (original === undefined) delete process.env.PLUMIX_DEV;
      else process.env.PLUMIX_DEV = original;
    }
  });

  test("prod fails closed: a loopback origin is rejected when PLUMIX_DEV is unset", async () => {
    const original = process.env.PLUMIX_DEV;
    delete process.env.PLUMIX_DEV;
    try {
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
    } finally {
      if (original === undefined) delete process.env.PLUMIX_DEV;
      else process.env.PLUMIX_DEV = original;
    }
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

describe("dispatcher — asset-shaped 404 short-circuit", () => {
  test("a static-asset miss (/favicon.ico) returns a plain 404 with no resolution and no themed render", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const blog = definePlugin("test-blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    });
    const h = await createDispatcherHarness({
      plugins: [blog],
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });

    const response = await h.dispatch(
      new Request("https://cms.example/favicon.ico"),
    );
    await h.drainDeferred();

    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("static-asset");
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    // The whole point: no route resolution, no themed render, no DB work.
    const spans = flattenSpans(snapshots[0]?.spans ?? []);
    expect(spans.some((s) => s.name === "resolve")).toBe(false);
    expect(spans.some((s) => s.name === "render")).toBe(false);
    expect(spans.some((s) => s.name.startsWith("db:"))).toBe(false);
  });

  test("the short-circuit beats a hierarchical catch-all route that would otherwise claim the path", async () => {
    // The #1491 trace: a pages-style `:path+` route matched `favicon.ico` and
    // paid a slug lookup. The extension check must win over the route map.
    const pages = definePlugin("test-pages", (ctx) => {
      ctx.registerEntryType("page", {
        label: "Pages",
        isPublic: true,
        isHierarchical: true,
      });
    });
    const h = await createDispatcherHarness({ plugins: [pages] });

    const response = await h.dispatch(
      new Request("https://cms.example/assets/chunk-abc.js"),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("static-asset");
  });

  test("a 404 for a client that doesn't accept HTML skips the themed render", async () => {
    const blog = definePlugin("test-blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    });
    const h = await createDispatcherHarness({ plugins: [blog] });

    const response = await h.dispatch(
      new Request("https://cms.example/post/nope", {
        headers: { accept: "application/json" },
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("public-post-not-found");
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    // A content 404 may become a real page at any moment — never cacheable.
    expect(response.headers.get("cache-control")).toBeNull();
  });

  test("a browser-shaped Accept header still gets the themed 404 page", async () => {
    const blog = definePlugin("test-blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    });
    const h = await createDispatcherHarness({ plugins: [blog] });

    const response = await h.dispatch(
      new Request("https://cms.example/post/nope", {
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
  });

  test("a 500 for a client that doesn't accept HTML skips the themed error render", async () => {
    const h = await createDispatcherHarness({
      theme: defineTheme({
        templates: [
          fallback(() => {
            throw new Error("render kaboom");
          }),
        ],
      }),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/", {
        headers: { accept: "application/json" },
      }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
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

// Depth-first span-tree walk shared by the telemetry assertions.
function flattenSpans(spans: readonly TelemetrySpan[]): TelemetrySpan[] {
  return spans.flatMap((span) => [span, ...flattenSpans(span.children)]);
}

describe("dispatcher — telemetry consumers", () => {
  // A plugin that observes mid-request whether the collector is live: an
  // active collector already holds the dispatch span during render.
  function spanObserver(): {
    plugin: AnyPluginDescriptor;
    seen: () => number | undefined;
  } {
    let spansSeenDuringRender: number | undefined;
    const plugin = definePlugin("telemetry-observer", (ctx) => {
      ctx.addFilter("render:document", (manifest, _data, appCtx) => {
        spansSeenDuringRender = appCtx.telemetry.getSpans().length;
        return manifest;
      });
    });
    return { plugin, seen: () => spansSeenDuringRender };
  }

  test("a registered consumer receives the finished snapshot: envelope, span tree, records, dropped counters", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const seenCtx: AppContext[] = [];
    const recorder = definePlugin("telemetry-recorder", (ctx) => {
      ctx.addFilter("render:document", (manifest, _data, appCtx) => {
        appCtx.telemetry.record("telemetry-recorder", {
          note: "during render",
        });
        return manifest;
      });
    });
    const h = await createDispatcherHarness({
      plugins: [recorder],
      telemetry: {
        consumers: [
          {
            id: "in-test",
            onRequestEnd: (snapshot, ctx) => {
              snapshots.push(snapshot);
              seenCtx.push(ctx);
            },
          },
        ],
      },
    });

    const response = await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    expect(snapshots).toHaveLength(1);
    const [snapshot] = snapshots;
    expect(snapshot?.request).toMatchObject({
      method: "GET",
      url: "https://cms.example/",
      status: response.status,
    });
    expect(snapshot?.request.requestId).toMatch(/[0-9a-f-]{36}/);
    // The envelope id is the context's request id — minted at context
    // creation, so mid-request consumers (logs, error hooks) and the finished
    // snapshot correlate on the same value.
    expect(snapshot?.request.requestId).toBe(seenCtx[0]?.requestId);
    expect(snapshot?.request.startedAt).toBeTypeOf("number");
    expect(snapshot?.request.durationMs).toBeGreaterThanOrEqual(0);
    expect(snapshot?.spans.map((s) => s.name)).toEqual(["dispatch"]);
    expect(snapshot?.records["telemetry-recorder"]?.map((r) => r.data)).toEqual(
      [{ note: "during render" }],
    );
    expect(
      snapshot?.records["telemetry-recorder"]?.every(
        (r) => typeof r.at === "number",
      ),
    ).toBe(true);
    expect(snapshot?.dropped).toEqual({ spans: 0, records: {} });
  });

  test("db query spans reach the snapshot with sql/params/rows — repeats (N+1) visible", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const blog = definePlugin("test-blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    });
    const h = await createDispatcherHarness({
      plugins: [blog],
      theme: defineTheme({ templates: [fallback(() => null)] }),
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Hello",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    await h.dispatch(new Request("https://cms.example/post/hello"));
    await h.drainDeferred();

    const [snapshot] = snapshots;

    // The resolve step runs several selects; each is one attributed span, so
    // an N+1 pattern shows up as repeated `db: select` spans in one request.
    const selects = flattenSpans(snapshot?.spans ?? []).filter(
      (span) => span.name === "db: select",
    );
    expect(selects.length).toBeGreaterThanOrEqual(2);
    const entryQuery = selects.find((s) => {
      const sqlAttr = s.attributes["db.sql"];
      return typeof sqlAttr === "string" && sqlAttr.includes("entries");
    });
    expect(entryQuery).toBeDefined();
    expect(Array.isArray(entryQuery?.attributes["db.params"])).toBe(true);
    expect(entryQuery?.attributes["db.rows"]).toBeTypeOf("number");
  });

  test("phase spans carry attributes: dispatch status, resolve entity+template, render node", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const blog = definePlugin("test-blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    });
    const h = await createDispatcherHarness({
      plugins: [blog],
      theme: defineTheme({ templates: [fallback(() => null)] }),
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    const author = await h.seedUser("admin");
    const entry = await h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Hello",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    await h.dispatch(new Request("https://cms.example/post/hello"));
    await h.drainDeferred();

    const [snapshot] = snapshots;
    const spans = flattenSpans(snapshot?.spans ?? []);
    const byName = (name: string): TelemetrySpan | undefined =>
      spans.find((span) => span.name === name);

    expect(byName("dispatch")?.attributes["http.response.status_code"]).toBe(
      200,
    );
    const resolve = byName("resolve");
    expect(resolve?.attributes["route.intent"]).toBe("single");
    expect(resolve?.attributes["resolve.entity"]).toEqual({
      kind: "entry",
      id: entry.id,
    });
    expect(resolve?.attributes["template.matched"]).toBe("fallback");
    expect(byName("render")?.attributes["render.node"]).toBe("post: hello");
  });

  test("a throwing render marks the failing phase spans as errors in the snapshot", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const h = await createDispatcherHarness({
      theme: defineTheme({
        templates: [
          fallback(() => {
            throw new Error("render kaboom");
          }),
        ],
      }),
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });

    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    const [snapshot] = snapshots;
    const spans = flattenSpans(snapshot?.spans ?? []);
    const render = spans.find((span) => span.name === "render");
    expect(render?.status).toBe("error");
    expect(render?.error?.message).toBe("render kaboom");
    // The motivating question is about the failure path: the resolve span must
    // still carry what had resolved before the throw.
    const resolve = spans.find((span) => span.name === "resolve");
    expect(resolve?.status).toBe("error");
    expect(resolve?.attributes["route.intent"]).toBe("front-page");
    expect(resolve?.attributes["template.matched"]).toBe("fallback");
  });

  test("a themed 404 render appears as a render span — its queries don't dangle under dispatch", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const blog = definePlugin("test-blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    });
    const h = await createDispatcherHarness({
      plugins: [blog],
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });

    await h.dispatch(new Request("https://cms.example/post/nope"));
    await h.drainDeferred();

    const [snapshot] = snapshots;
    const spans = flattenSpans(snapshot?.spans ?? []);
    const render = spans.find((span) => span.name === "render");
    expect(render?.attributes["render.node"]).toBe("error: notFound");
    // The error render shares the interior instrumentation: the React SSR
    // pass is a `render: react` child, not invisible render self-time.
    expect(render?.children.map((c) => c.name)).toContain("render: react");
  });

  test("render interior phases appear as children: deps, head, loaders, react", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const probe = definePlugin("test-probe", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerTemplateDep("probe-dep", {
        load: (slugs) =>
          Promise.resolve(
            Object.fromEntries(slugs.map((s) => [s, { value: s }])),
          ),
      });
      ctx.registerBlock(
        defineBlock({
          name: "acme/probe",
          loaders: { marker: () => Promise.resolve("loaded") },
          render: () => null,
        }),
      );
    });
    const h = await createDispatcherHarness({
      plugins: [probe],
      theme: defineTheme({
        templates: [
          fallback(defineTemplate({ "probe-dep": ["a"], render: () => null })),
        ],
      }),
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "traced",
      title: "Traced",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "n", name: "acme/probe", attrs: {} }],
      },
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    await h.dispatch(new Request("https://cms.example/post/traced"));
    await h.drainDeferred();

    const [snapshot] = snapshots;
    const render = flattenSpans(snapshot?.spans ?? []).find(
      (span) => span.name === "render",
    );
    const childNames = render?.children.map((c) => c.name) ?? [];
    expect(childNames).toContain("render: deps");
    expect(childNames).toContain("render: head");
    expect(childNames).toContain("render: loaders");
    expect(childNames).toContain("render: react");
    const byName = (name: string): TelemetrySpan | undefined =>
      render?.children.find((c) => c.name === name);
    expect(byName("render: deps")?.attributes["deps.kinds"]).toEqual([
      "probe-dep",
    ]);
    expect(byName("render: loaders")?.attributes["loaders.blocks"]).toBe(1);
  });

  test("session-cookie auth resolution appears as an auth span with the resolved user", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const h = await createDispatcherHarness({
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    const user = await h.seedUser("admin");
    const request = await h.authenticateRequest(
      new Request("https://cms.example/"),
      user.id,
    );

    await h.dispatch(request);
    await h.drainDeferred();

    const [snapshot] = snapshots;
    const auth = flattenSpans(snapshot?.spans ?? []).find(
      (span) => span.name === "auth",
    );
    expect(auth).toBeDefined();
    expect(auth?.attributes).toEqual({
      "auth.authenticated": true,
      "auth.user.id": user.id,
    });
  });

  test("filter execution appears as a hook span attributed with hook name and owning plugin", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const decorator = definePlugin("test-decorator", (ctx) => {
      ctx.addFilter("render:document", (manifest) => manifest);
    });
    const h = await createDispatcherHarness({
      plugins: [decorator],
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });

    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    const [snapshot] = snapshots;
    const hook = flattenSpans(snapshot?.spans ?? []).find(
      (span) => span.name === "hook: render:document",
    );
    expect(hook).toBeDefined();
    expect(hook?.attributes).toEqual({
      "hook.name": "render:document",
      "hook.plugin": "test-decorator",
    });
  });

  test("edge-cache decisions land in the snapshot as records: miss, hit, bypass with reason", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const store = new Map<string, Response>();
    const cache: ConnectedCache = {
      match: (req) => Promise.resolve(store.get(req.url)?.clone()),
      put: (req, res) => {
        store.set(req.url, res);
        return Promise.resolve();
      },
      purgeTags: () => Promise.resolve(),
    };
    const h = await createDispatcherHarness({
      cache,
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });

    // Anonymous front page: miss then stored, so the second request hits.
    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();
    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();
    // A session cookie makes the request privileged: the cache is bypassed.
    const user = await h.seedUser("admin");
    await h.dispatch(
      await h.authenticateRequest(new Request("https://cms.example/"), user.id),
    );
    await h.drainDeferred();

    const decisions = snapshots.map((s) => s.records.cache?.map((r) => r.data));
    expect(decisions).toEqual([
      [{ decision: "miss", stored: true }],
      [{ decision: "hit" }],
      [{ decision: "bypass", reason: "privileged" }],
    ]);

    // The lookup/store latency itself is spanned (#1494): the miss carries
    // `cache: match` + `cache: put`, the hit just `cache: match` with the
    // outcome stamped.
    const spanNames = snapshots.map((s) =>
      flattenSpans(s.spans)
        .map((span) => span.name)
        .filter((name) => name.startsWith("cache: ")),
    );
    expect(spanNames[0]).toEqual(["cache: match", "cache: put"]);
    expect(spanNames[1]).toEqual(["cache: match"]);
  });

  test("an admin RPC call produces an rpc procedure span in the snapshot", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const h = await createDispatcherHarness({
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    const user = await h.seedUser("admin");
    const request = await h.authenticateRequest(
      plumixRequest("/_plumix/rpc/entry/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
      user.id,
    );

    const response = await h.dispatch(request);
    await h.drainDeferred();

    expect(response.status).toBe(200);
    const [snapshot] = snapshots;
    const spans = flattenSpans(snapshot?.spans ?? []);
    const rpc = spans.find((s) => s.name === "rpc: entry.list");
    expect(rpc?.status).toBe("ok");
    expect(rpc?.attributes).toEqual({ "rpc.procedure": "entry.list" });
    // The authenticated middleware runs inside the procedure call, so the
    // auth span nests within the rpc span.
    expect(flattenSpans(rpc ? [rpc] : []).some((s) => s.name === "auth")).toBe(
      true,
    );
  });

  test("a slow consumer never delays the response — export waits in the defer queue", async () => {
    let finishExport!: () => void;
    const exportDone = new Promise<void>((r) => (finishExport = r));
    let exported = false;
    const h = await createDispatcherHarness({
      telemetry: {
        consumers: [
          {
            id: "slow",
            onRequestEnd: async () => {
              await exportDone;
              exported = true;
            },
          },
        ],
      },
    });

    // The response resolves while the export is still pending — delivery is
    // deferred (the platform's `waitUntil`), never awaited on the hot path.
    const response = await h.dispatch(new Request("https://cms.example/"));

    expect(response.status).toBeTypeOf("number");
    expect(exported).toBe(false);
    finishExport();
    await h.drainDeferred();
    expect(exported).toBe(true);
  });

  test("sample: () => false means nothing is collected or delivered for the request", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const { plugin, seen } = spanObserver();
    const h = await createDispatcherHarness({
      plugins: [plugin],
      telemetry: {
        consumers: [
          {
            id: "opt-out",
            sample: () => false,
            onRequestEnd: (s) => void snapshots.push(s),
          },
        ],
      },
    });

    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    expect(snapshots).toHaveLength(0);
    expect(seen()).toBe(0);
  });

  test("with no consumers registered the collector is the no-op", async () => {
    const { plugin, seen } = spanObserver();
    const h = await createDispatcherHarness({ plugins: [plugin] });

    await h.dispatch(new Request("https://cms.example/"));

    expect(seen()).toBe(0);
  });

  test("one yes vote activates collection; a no-voting consumer gets no snapshot", async () => {
    const received: string[] = [];
    const consumer = (
      id: string,
      sample: () => boolean,
    ): TelemetryConsumer => ({
      id,
      sample,
      onRequestEnd: () => void received.push(id),
    });
    const h = await createDispatcherHarness({
      telemetry: {
        consumers: [consumer("yes", () => true), consumer("no", () => false)],
      },
    });

    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    expect(received).toEqual(["yes"]);
  });

  test("a 500 request still delivers its snapshot, status and error included", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const h = await createDispatcherHarness({
      theme: defineTheme({
        templates: [
          fallback(() => {
            throw new Error("render kaboom");
          }),
        ],
      }),
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });

    const response = await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    expect(response.status).toBe(500);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.request.status).toBe(500);
  });

  describe("dev debug-bar consumer", () => {
    const original = process.env.PLUMIX_DEV;
    afterEach(() => {
      if (original === undefined) delete process.env.PLUMIX_DEV;
      else process.env.PLUMIX_DEV = original;
    });

    test("in dev the bar registers as a consumer: collection is active with no config consumers", async () => {
      process.env.PLUMIX_DEV = "1";
      const { plugin, seen } = spanObserver();
      const h = await createDispatcherHarness({ plugins: [plugin] });

      await h.dispatch(new Request("https://cms.example/"));

      // The live dispatch span is visible mid-request — the bar's reads work.
      expect(seen()).toBeGreaterThan(0);
    });

    test("a disabled bar registers no consumer: dev collects nothing", async () => {
      process.env.PLUMIX_DEV = "1";
      const { plugin, seen } = spanObserver();
      const h = await createDispatcherHarness({
        plugins: [plugin],
        debugBar: false,
      });

      await h.dispatch(new Request("https://cms.example/"));

      expect(seen()).toBe(0);
    });
  });
});

describe("dispatcher — ctx.fetch tracing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function findSpan(
    spans: readonly TelemetrySpan[],
    name: string,
  ): TelemetrySpan | undefined {
    for (const span of spans) {
      if (span.name === name) return span;
      const nested = findSpan(span.children, name);
      if (nested) return nested;
    }
    return undefined;
  }

  // A plugin whose render-path filter performs the outbound call — the same
  // "real request through the dispatcher" seam the consumer tests use.
  function outboundCaller(
    call: (appCtx: AppContext) => Promise<unknown>,
  ): AnyPluginDescriptor {
    return definePlugin("outbound-caller", (ctx) => {
      ctx.addFilter("render:document", async (manifest, _data, appCtx) => {
        await call(appCtx);
        return manifest;
      });
    });
  }

  async function harnessWithSnapshots(plugin: AnyPluginDescriptor): Promise<{
    h: DispatcherHarness;
    snapshots: TelemetrySnapshot[];
  }> {
    const snapshots: TelemetrySnapshot[] = [];
    const h = await createDispatcherHarness({
      plugins: [plugin],
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    return { h, snapshots };
  }

  test("a route calling an external API via ctx.fetch produces a span with method, URL, and status", async () => {
    const stub = vi.fn(() =>
      Promise.resolve(new Response("pong", { status: 201 })),
    );
    vi.stubGlobal("fetch", stub);
    const { h, snapshots } = await harnessWithSnapshots(
      outboundCaller((appCtx) =>
        appCtx.fetch("https://api.example.com/v1/items", { method: "POST" }),
      ),
    );

    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    expect(stub).toHaveBeenCalledOnce();
    const span = findSpan(
      snapshots[0]?.spans ?? [],
      "fetch: POST api.example.com",
    );
    expect(span).toBeDefined();
    expect(span?.status).toBe("ok");
    expect(span?.durationMs).toBeGreaterThanOrEqual(0);
    expect(span?.attributes).toEqual({
      "http.request.method": "POST",
      "url.full": "https://api.example.com/v1/items",
      "http.response.status_code": 201,
    });
  });

  test("a ctx.fetch span nests under the enclosing semantic span", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("pong", { status: 200 })),
    );
    const { h, snapshots } = await harnessWithSnapshots(
      outboundCaller((appCtx) =>
        appCtx.telemetry.span("load external items", () =>
          appCtx.fetch("https://api.example.com/v1/items"),
        ),
      ),
    );

    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    const outer = findSpan(snapshots[0]?.spans ?? [], "load external items");
    expect(outer?.children.map((s) => s.name)).toEqual([
      "fetch: GET api.example.com",
    ]);
  });

  test("a rejecting fetch marks its span with error status and the failure propagates to the caller", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.reject(new TypeError("getaddrinfo ENOTFOUND api.example.com")),
    );
    let caught: unknown;
    const { h, snapshots } = await harnessWithSnapshots(
      outboundCaller(async (appCtx) => {
        // A degrading plugin swallows the failure; the span still records it.
        try {
          await appCtx.fetch("https://api.example.com/v1/items");
        } catch (error) {
          caught = error;
        }
      }),
    );

    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    expect(caught).toBeInstanceOf(TypeError);
    const span = findSpan(
      snapshots[0]?.spans ?? [],
      "fetch: GET api.example.com",
    );
    expect(span?.status).toBe("error");
    expect(span?.error?.message).toBe("getaddrinfo ENOTFOUND api.example.com");
    expect(span?.attributes).toEqual({
      "http.request.method": "GET",
      "url.full": "https://api.example.com/v1/items",
    });
  });

  test("ctx.fetch never patches the global: bare fetch stays the platform's own", async () => {
    const stub = (): Promise<Response> => Promise.resolve(new Response("pong"));
    vi.stubGlobal("fetch", stub);
    const h = await createDispatcherHarness({
      plugins: [
        outboundCaller((appCtx) => appCtx.fetch("https://api.example.com/")),
      ],
    });

    await h.dispatch(new Request("https://cms.example/"));

    expect(globalThis.fetch).toBe(stub);
  });
});
