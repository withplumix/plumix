import { describe, expect, test, vi } from "vitest";

import type { ConnectedCache } from "../runtime/slots.js";
import { tagCacheEntry } from "../cache/route-tags.js";
import { entryPurgeTags } from "../cache/tags.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

// A plugin that owns a path at the site root, the way `@plumix/plugin-feeds`
// owns `/feed` and `@plumix/plugin-seo` will own `/robots.txt` and the sitemap.
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

  test("a route registered from theme:ready is served", async () => {
    // The registration point the seam is designed around: by `theme:ready`
    // every entry type and taxonomy is known, so a plugin enumerates them and
    // claims concrete paths instead of matching a pattern per request.
    const feeds = definePlugin("feeds", (ctx) => {
      ctx.addAction("theme:ready", () => {
        ctx.registerPublicRoute({
          path: "/feed",
          handler: () => new Response("owned", { status: 200 }),
        });
      });
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
    (await harness.fetch("/robots.txt")).assertStatus(200);
    (await harness.fetch("/nothing-here")).assertStatus(404);
  });
});

describe("public route dispatch — edge cache", () => {
  function cacheStub(hit?: Response) {
    const match = vi.fn<ConnectedCache["match"]>(() => Promise.resolve(hit));
    const put = vi.fn<ConnectedCache["put"]>(() => Promise.resolve());
    const purgeTags = vi.fn<ConnectedCache["purgeTags"]>(() =>
      Promise.resolve(),
    );
    return { cache: { match, put, purgeTags }, match, put };
  }

  // What the sitemap will be: one document for every visitor, tagged with the
  // content it listed so a publish retires that scope and nothing else.
  const sitemap = definePlugin("seo", (ctx) => {
    ctx.registerPublicRoute({
      path: "/sitemap.xml",
      cacheable: true,
      handler: (_request, appCtx) => {
        tagCacheEntry(appCtx, entryPurgeTags("post", 7));
        return new Response("<urlset/>", { status: 200 });
      },
    });
  });

  test("an opted-in route stores its response under the tags it declared", async () => {
    const { cache, put } = cacheStub();
    const harness = await createDispatcherHarness({
      plugins: [sitemap],
      cache,
    });

    (await harness.fetch("/sitemap.xml")).assertStatus(200);
    await harness.drainDeferred();

    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[2]).toEqual(["t:post", "e:7"]);
  });

  test("a subsequent request is served from the stored entry", async () => {
    const { cache, match } = cacheStub(new Response("CACHED", { status: 200 }));
    const harness = await createDispatcherHarness({
      plugins: [sitemap],
      cache,
    });

    const response = await harness.fetch("/sitemap.xml");

    expect(match).toHaveBeenCalledOnce();
    expect(await response.text()).toBe("CACHED");
  });

  test("a route that did not opt in never touches the cache", async () => {
    const { cache, match, put } = cacheStub(
      new Response("CACHED", { status: 200 }),
    );
    const harness = await createDispatcherHarness({
      plugins: [owner("/feed")],
      cache,
    });

    const response = await harness.fetch("/feed");

    expect(await response.text()).toBe("owned");
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
