import { describe, expect, test, vi } from "vitest";

import type { AccessPolicy } from "../access/policy.js";
import type { AppContext } from "../context/app.js";
import type { CdnStore, ConnectedCdn } from "../runtime/slots.js";
import {
  authenticatedPolicy,
  challenge,
  definePolicy,
  grant,
  rolePolicy,
} from "../access/policy.js";
import { tagCdnEntry } from "../cdn/route-tags.js";
import { entryPurgeTags } from "../cdn/tags.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

// A plugin that owns a path at the site root, the way `@plumix/plugin-feeds`
// owns `/feed` and `@plumix/plugin-seo` owns `/robots.txt` and the sitemap.
function owner(path: string, body = "owned", pluginId = "feeds") {
  return definePlugin(pluginId, (ctx) => {
    ctx.registerPublicRoute({
      path,
      handler: () => new Response(body, { status: 200 }),
    });
  });
}

describe("public route dispatch", () => {
  test("a registered root path is served by its plugin", async () => {
    const harness = await createDispatcherHarness({
      plugins: [owner("/feed")],
    });
    const response = await harness.fetch("/feed");
    response.assertStatus(200);
    expect(await response.text()).toBe("owned");
  });

  test("a URL pattern matches and hands its parameters to the handler", async () => {
    const plugin = definePlugin("seo", (ctx) => {
      ctx.registerPublicRoute({
        path: "/sitemap-:scope-:page.xml",
        handler: (_request, _ctx, params) =>
          new Response(`${params.scope}/${params.page}`, { status: 200 }),
      });
    });
    const harness = await createDispatcherHarness({ plugins: [plugin] });
    const response = await harness.fetch("/sitemap-post-2.xml");
    expect(await response.text()).toBe("post/2");
  });

  test.each([
    ["robots", "/robots.txt"],
    ["the sitemap index", "/sitemap.xml"],
    ["a sub-sitemap", "/sitemap-post-1.xml"],
  ])("shadows core's own %s branch", async (_name, path) => {
    const blog = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    });
    const harness = await createDispatcherHarness({
      plugins: [blog, owner(path)],
    });
    const response = await harness.fetch(path);
    expect(await response.text()).toBe("owned");
  });

  test("matches ahead of the redirect table", async () => {
    const harness = await createDispatcherHarness({
      plugins: [owner("/feed")],
      redirects: [{ from: "/feed", to: "/elsewhere", status: 301 }],
    });
    const response = await harness.fetch("/feed");
    response.assertStatus(200);
  });

  test("matches ahead of a published entry at the same path", async () => {
    const blog = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    });
    const harness = await createDispatcherHarness({
      plugins: [blog, owner("/post/hello")],
    });
    const author = await harness.seedUser("admin");
    await harness.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "hello",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: null,
    });
    const response = await harness.fetch("/post/hello");
    expect(await response.text()).toBe("owned");
  });

  test("a content-plausible extension routes; an asset extension still 404s early", async () => {
    const harness = await createDispatcherHarness({
      plugins: [owner("/ads.txt")],
    });
    (await harness.fetch("/ads.txt")).assertStatus(200);
    const missing = await harness.fetch("/logo.png");
    missing.assertStatus(404);
    expect(missing.headers.get("cache-control")).toBe("public, max-age=300");
  });

  test("only GET and HEAD reach a public route", async () => {
    const harness = await createDispatcherHarness({
      plugins: [owner("/feed")],
    });
    const response = await harness.fetch("/feed", { method: "POST" });
    response.assertStatus(405);
  });

  test("a route registered from afterSetup is served", async () => {
    // The registration point the seam is designed around: by `afterSetup`
    // every entry type and taxonomy is known, so a plugin enumerates them and
    // claims concrete paths instead of matching a pattern per request.
    const feeds = definePlugin("feeds", {
      setup: () => undefined,
      afterSetup: (ctx) => {
        ctx.registerPublicRoute({
          path: "/feed",
          handler: () => new Response("owned", { status: 200 }),
        });
      },
    });
    const harness = await createDispatcherHarness({ plugins: [feeds] });
    expect(await (await harness.fetch("/feed")).text()).toBe("owned");
  });

  test("one path claimed by two plugins throws at boot", async () => {
    await expect(
      createDispatcherHarness({
        plugins: [owner("/feed"), owner("/feed", "shadowed", "seo")],
      }),
    ).rejects.toThrow(
      /Plugin "seo" registers public route "\/feed" already registered by "feeds"/,
    );
  });

  test("a site with no registered public route behaves as before", async () => {
    const harness = await createDispatcherHarness();
    (await harness.fetch("/")).assertStatus(200);
    (await harness.fetch("/nothing-here")).assertStatus(404);
  });
});

function cdnStub(hit?: Response) {
  const match = vi.fn<CdnStore["match"]>(() => Promise.resolve(hit));
  const put = vi.fn<CdnStore["put"]>(() => Promise.resolve());
  const cdn: ConnectedCdn = {
    decorate: (response) => response,
    store: { match, put },
    purgeTags: vi.fn(() => Promise.resolve()),
  };
  return { cdn, match, put };
}

describe("public route dispatch — CDN", () => {
  // What the sitemap will be: one document for every visitor, tagged with the
  // content it listed so a publish retires that scope and nothing else.
  const sitemap = definePlugin("seo", (ctx) => {
    ctx.registerPublicRoute({
      path: "/sitemap.xml",
      cacheable: true,
      handler: (_request, appCtx) => {
        tagCdnEntry(appCtx, entryPurgeTags("post", 7));
        return new Response("<urlset/>", { status: 200 });
      },
    });
  });

  test("an opted-in route stores its response under the tags it declared", async () => {
    const { cdn, put } = cdnStub();
    const harness = await createDispatcherHarness({
      plugins: [sitemap],
      cdn,
    });

    (await harness.fetch("/sitemap.xml")).assertStatus(200);
    await harness.drainDeferred();

    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[2]).toEqual(["t:post", "e:7"]);
  });

  test("a subsequent request is served from the stored entry", async () => {
    const { cdn, match } = cdnStub(new Response("CACHED", { status: 200 }));
    const harness = await createDispatcherHarness({
      plugins: [sitemap],
      cdn,
    });

    const response = await harness.fetch("/sitemap.xml");

    expect(match).toHaveBeenCalledOnce();
    expect(await response.text()).toBe("CACHED");
  });

  test("a route that did not opt in never touches the CDN", async () => {
    const { cdn, match, put } = cdnStub(
      new Response("CACHED", { status: 200 }),
    );
    const harness = await createDispatcherHarness({
      plugins: [owner("/feed")],
      cdn,
    });

    const response = await harness.fetch("/feed");

    expect(await response.text()).toBe("owned");
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});

describe("public route dispatch — access policy", () => {
  // A route that echoes who core let through, so a test reads the handler's
  // view of the request off the response rather than off a spy.
  function policied(
    access: AccessPolicy,
    options: { readonly cacheable?: boolean } = {},
  ) {
    const handler = vi.fn((_request: Request, ctx: AppContext) =>
      Response.json({
        userId: ctx.user?.id ?? null,
        segment: ctx.access?.segment ?? null,
      }),
    );
    const plugin = definePlugin("feeds", (ctx) => {
      ctx.registerPublicRoute({ path: "/feed", access, handler, ...options });
    });
    return { plugin, handler };
  }

  test("an anonymous reader who fails a redirect gate is sent to sign-in", async () => {
    const { plugin, handler } = policied(authenticatedPolicy);
    const harness = await createDispatcherHarness({ plugins: [plugin] });

    const response = await harness.fetch("/feed");

    response.assertStatus(302);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?redirectTo=%2Ffeed",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(handler).not.toHaveBeenCalled();
  });

  test("a reader who fails a hard challenge gets the challenge response", async () => {
    const { plugin, handler } = policied(rolePolicy("editor"));
    const harness = await createDispatcherHarness({ plugins: [plugin] });
    const reader = await harness.seedUser("subscriber");

    const response = await harness.fetch("/feed", { as: reader });

    response.assertStatus(403);
    expect(response.headers.get("x-plumix-challenge")).toBe("forbidden");
    expect(handler).not.toHaveBeenCalled();
  });

  test("a reader who passes the gate reaches the handler as themselves", async () => {
    const { plugin } = policied(rolePolicy("editor"));
    const harness = await createDispatcherHarness({ plugins: [plugin] });
    const editor = await harness.seedUser("editor");

    const response = await harness.fetch("/feed", { as: editor });

    response.assertStatus(200);
    expect(await response.json()).toEqual({
      userId: editor.id,
      segment: "role:editor",
    });
  });

  test("a policied route stays out of the CDN even when it opted in", async () => {
    const { cdn, match, put } = cdnStub(
      new Response("CACHED", { status: 200 }),
    );
    const { plugin, handler } = policied(rolePolicy("editor"), {
      cacheable: true,
    });
    const harness = await createDispatcherHarness({ plugins: [plugin], cdn });
    const editor = await harness.seedUser("editor");

    (await harness.fetch("/feed", { as: editor })).assertStatus(200);
    (await harness.fetch("/feed", { as: editor })).assertStatus(200);
    await harness.drainDeferred();

    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test("a reader-specific response forbids downstream caches from storing it", async () => {
    const { plugin } = policied(rolePolicy("editor"));
    const harness = await createDispatcherHarness({ plugins: [plugin] });
    const editor = await harness.seedUser("editor");

    const response = await harness.fetch("/feed", { as: editor });

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")?.toLowerCase()).toContain("cookie");
  });

  test("an anonymous-segment response keeps the handler's cache headers", async () => {
    const { plugin } = policied(
      definePolicy({ resolve: () => grant("anonymous") }),
    );
    const harness = await createDispatcherHarness({ plugins: [plugin] });

    const response = await harness.fetch("/feed");

    response.assertStatus(200);
    expect(response.headers.get("cache-control")).toBeNull();
  });

  test("a soft challenge runs the handler and signals the challenge", async () => {
    const { plugin } = policied(
      definePolicy({ resolve: () => challenge("subscribe", { soft: true }) }),
    );
    const harness = await createDispatcherHarness({ plugins: [plugin] });

    const response = await harness.fetch("/feed");

    response.assertStatus(200);
    expect(response.headers.get("x-plumix-challenge")).toBe("subscribe");
  });

  test("a soft challenge on a 404 carries no challenge signal", async () => {
    const plugin = definePlugin("feeds", (ctx) => {
      ctx.registerPublicRoute({
        path: "/feed",
        access: definePolicy({
          resolve: () => challenge("subscribe", { soft: true }),
        }),
        handler: () => new Response("gone", { status: 404 }),
      });
    });
    const harness = await createDispatcherHarness({ plugins: [plugin] });

    const response = await harness.fetch("/feed");

    response.assertStatus(404);
    expect(response.headers.get("x-plumix-challenge")).toBeNull();
  });

  test("a route with no policy still sees no user, however the request signed in", async () => {
    const plugin = definePlugin("feeds", (ctx) => {
      ctx.registerPublicRoute({
        path: "/feed",
        handler: (_request, appCtx) =>
          Response.json({ userId: appCtx.user?.id ?? null }),
      });
    });
    const harness = await createDispatcherHarness({ plugins: [plugin] });
    const admin = await harness.seedUser("admin");

    const response = await harness.fetch("/feed", { as: admin });

    expect(await response.json()).toEqual({ userId: null });
  });
});
