import { describe, expect, test } from "vitest";

import type { RegisteredRawRoute } from "../plugin/manifest.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness, plumixRequest } from "../test/dispatcher.js";
import { matchPluginRawRoute } from "./dispatcher.js";

describe("dispatcher — routing", () => {
  test("public / 404s when no plugin claims it", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(new Request("https://cms.example/"));
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe(
      "public-route-not-found",
    );
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
      plumixRequest("/_plumix/admin/entries/new", { method: "GET" }),
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
