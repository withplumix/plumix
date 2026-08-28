import type { AnyPluginDescriptor, ConnectedCache, JsonValue } from "plumix";
import type { DispatcherHarness } from "plumix/test";
import { entryPurgeTags, typeTag } from "plumix";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test, vi } from "vitest";

import { seo } from "./index.js";
import { SITEMAP_TAG } from "./routes.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

const taxonomyPlugin = definePlugin("taxo", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
  ctx.registerTermTaxonomy("category", {
    label: "Categories",
    isHierarchical: false,
    entryTypes: ["post"],
  });
});

// An archive type owning its own sitemap scope, through this plugin's
// augmentation rather than a core field.
const eventsPlugin = definePlugin("events", (ctx) => {
  ctx.registerArchiveType("event-series", {
    routes: ["/events/:series"],
    resolve: (_ctx, params) => ({
      data: { kind: "custom", name: "event-series" },
      title: `Series: ${params.series}`,
    }),
    sitemap: {
      // > SITEMAP_PAGE_SIZE (1000) so the index paginates the scope into two.
      count: () => 1500,
      urls: (_ctx, page) => [
        {
          loc: `https://cms.example/events/summer?page=${String(page)}`,
          lastmod: "2026-08-01T00:00:00.000Z",
        },
      ],
      tags: ["events"],
    },
  });
});

// A settings save fires its action mid-request, which is where the purge
// accumulator lives; this stands in for the RPC that would normally fire it.
function settingsSaver(group: string): AnyPluginDescriptor {
  return definePlugin("settings-saver", (ctx) => {
    ctx.registerPublicRoute({
      path: "/fire-settings-change",
      handler: async (_request, appCtx) => {
        await appCtx.hooks.doAction("settings:group_changed", {
          group,
          set: { indexable: false },
          removed: [],
        });
        return new Response("ok");
      },
    });
  });
}

function createHarness(
  plugins: readonly AnyPluginDescriptor[] = [blogPlugin],
  options: { readonly cache?: ConnectedCache } = {},
): Promise<DispatcherHarness> {
  return createDispatcherHarness({ plugins: [...plugins, seo()], ...options });
}

async function seedPost(
  h: DispatcherHarness,
  overrides: {
    readonly slug?: string;
    readonly status?: "published" | "draft";
    readonly meta?: Record<string, JsonValue>;
  } = {},
): Promise<void> {
  const author = await h.seedUser("admin");
  await h.factory.entry.create({
    type: "post",
    slug: overrides.slug ?? "hello",
    title: "Hello",
    content: null,
    status: overrides.status ?? "published",
    ...(overrides.meta === undefined ? {} : { meta: overrides.meta }),
    authorId: author.id,
    publishedAt: new Date(),
  });
}

async function bodyOf(h: DispatcherHarness, path: string): Promise<string> {
  const res = await h.dispatch(new Request(`https://cms.example${path}`));
  return res.text();
}

describe("/robots.txt", () => {
  test("is text/plain and allows crawling by default", async () => {
    const h = await createHarness();

    const res = await h.dispatch(new Request("https://cms.example/robots.txt"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("User-agent: *\nDisallow:\n");
  });

  test("a site held out of the index disallows all crawling", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "seo",
      key: "indexable",
      value: false,
    });

    expect(await bodyOf(h, "/robots.txt")).toBe("User-agent: *\nDisallow: /\n");
  });

  test("the legacy site.public row still holds a site private", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "site",
      key: "public",
      value: false,
    });

    expect(await bodyOf(h, "/robots.txt")).toBe("User-agent: *\nDisallow: /\n");
  });

  test("the seo:robots-txt filter can modify the body", async () => {
    const sitemapLine = definePlugin("robots-test", (ctx) => {
      ctx.addFilter(
        "seo:robots-txt",
        (body) => `${body}Sitemap: https://cms.example/sitemap.xml\n`,
      );
    });
    const h = await createHarness([blogPlugin, sitemapLine]);

    expect(await bodyOf(h, "/robots.txt")).toContain(
      "Sitemap: https://cms.example/sitemap.xml",
    );
  });
});

describe("the sitemap index", () => {
  test("lists a sub-sitemap for a type with published content", async () => {
    const h = await createHarness();
    await seedPost(h);

    const res = await h.dispatch(
      new Request("https://cms.example/sitemap.xml"),
    );
    const body = await res.text();

    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain("<sitemapindex");
    expect(body).toContain("<loc>https://cms.example/sitemap-post-1.xml</loc>");
  });

  test("leaves out a scope with nothing published", async () => {
    const h = await createHarness();

    expect(await bodyOf(h, "/sitemap.xml")).not.toContain("<sitemap>");
  });

  test("paginates a custom archive's scope by its own count", async () => {
    const h = await createHarness([eventsPlugin]);

    const body = await bodyOf(h, "/sitemap.xml");

    expect(body).toContain("https://cms.example/sitemap-event-series-1.xml");
    expect(body).toContain("https://cms.example/sitemap-event-series-2.xml");
    expect(body).not.toContain("sitemap-event-series-3.xml");
  });

  test("lists base-prefixed sub-sitemap URLs under a base path", async () => {
    // The registered route path is root-relative; only the published `<loc>`
    // re-adds the prefix the dispatcher stripped.
    const h = await createDispatcherHarness({
      basePath: "/custom-directory",
      plugins: [blogPlugin, seo()],
    });
    await seedPost(h);

    const res = await h.dispatch(
      new Request("https://cms.example/custom-directory/sitemap.xml"),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain(
      "https://cms.example/custom-directory/sitemap-post-1.xml",
    );
  });

  test("a site held out of the index publishes an empty index", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "seo",
      key: "indexable",
      value: false,
    });
    await seedPost(h);

    const body = await bodyOf(h, "/sitemap.xml");

    expect(body).toContain("<sitemapindex");
    expect(body).not.toContain("<sitemap>");
  });
});

describe("a sub-sitemap", () => {
  test("lists published entry URLs with lastmod, excluding drafts", async () => {
    const h = await createHarness();
    await seedPost(h, { slug: "live" });
    await seedPost(h, { slug: "draft", status: "draft" });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain("<loc>https://cms.example/post/live</loc>");
    expect(body).toContain("<lastmod>");
    expect(body).not.toContain("/post/draft");
  });

  test("a page past the end is an empty url-set", async () => {
    const h = await createHarness();
    await seedPost(h);

    const body = await bodyOf(h, "/sitemap-post-2.xml");

    expect(body).toContain("<urlset");
    expect(body).not.toContain("<url>");
  });

  test("lists a taxonomy's term URLs", async () => {
    const h = await createHarness([taxonomyPlugin]);
    await h.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });

    expect(await bodyOf(h, "/sitemap-category-1.xml")).toContain(
      "<loc>https://cms.example/category/news</loc>",
    );
  });

  test("serves a custom archive's provider URLs for the page", async () => {
    const h = await createHarness([eventsPlugin]);

    const body = await bodyOf(h, "/sitemap-event-series-2.xml");

    expect(body).toContain(
      "<loc>https://cms.example/events/summer?page=2</loc>",
    );
    expect(body).toContain("<lastmod>2026-08-01T00:00:00.000Z</lastmod>");
  });

  test("a site held out of the index publishes an empty url-set", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "seo",
      key: "indexable",
      value: false,
    });
    await seedPost(h);

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain("<urlset");
    expect(body).not.toContain("<url>");
  });

  test("a scope whose name prefixes another does not shadow it", async () => {
    // `event` and `event-series` both claim `/sitemap-event-...`. An
    // unconstrained `:page` swallows hyphens, so the `event` route would match
    // `/sitemap-event-series-1.xml` and answer for a page it cannot serve.
    const eventEntries = definePlugin("event-entries", (ctx) => {
      ctx.registerEntryType("event", {
        label: "Events",
        isPublic: true,
        hasArchive: true,
      });
    });
    const h = await createHarness([eventEntries, eventsPlugin]);

    const body = await bodyOf(h, "/sitemap-event-series-1.xml");

    expect(body).toContain(
      "<loc>https://cms.example/events/summer?page=1</loc>",
    );
  });

  test("an unregistered scope is not claimed at all", async () => {
    const h = await createHarness();

    const res = await h.dispatch(
      new Request("https://cms.example/sitemap-nope-1.xml"),
    );

    expect(res.status).toBe(404);
  });

  test.each(["abc", "0", "1.2"])(
    "a page segment of %s is not claimed at all",
    async (page) => {
      const h = await createHarness();

      const res = await h.dispatch(
        new Request(`https://cms.example/sitemap-post-${page}.xml`),
      );

      expect(res.status).toBe(404);
    },
  );
});

describe("seo:sitemap:urls", () => {
  test("can drop every URL", async () => {
    const dropAll = definePlugin("sitemap-drop", (ctx) => {
      ctx.addFilter("seo:sitemap:urls", () => []);
    });
    const h = await createHarness([blogPlugin, dropAll]);
    await seedPost(h);

    expect(await bodyOf(h, "/sitemap-post-1.xml")).not.toContain("<url>");
  });

  test("receives the scope, page and ctx so a subscriber can inject rows", async () => {
    const injector = definePlugin("injector", (ctx) => {
      ctx.addFilter("seo:sitemap:urls", (urls, scope, page, appCtx) => [
        ...urls,
        { loc: `${appCtx.origin}/injected/${scope}?page=${String(page)}` },
      ]);
    });
    const h = await createHarness([eventsPlugin, injector]);

    expect(await bodyOf(h, "/sitemap-event-series-1.xml")).toContain(
      "<loc>https://cms.example/injected/event-series?page=1</loc>",
    );
  });
});

describe("a sitemap at the edge", () => {
  function edgeStub() {
    const store = new Map<string, Response>();
    const put = vi.fn<ConnectedCache["put"]>((request, response) => {
      store.set(request.url, response);
      return Promise.resolve();
    });
    const match = vi.fn<ConnectedCache["match"]>((request) =>
      Promise.resolve(store.get(request.url)?.clone()),
    );
    const purgeTags = vi.fn<ConnectedCache["purgeTags"]>(() =>
      Promise.resolve(),
    );
    return { cache: { match, put, purgeTags }, match, put, purgeTags };
  }

  function tagsFor(
    put: ReturnType<typeof edgeStub>["put"],
    path: string,
  ): readonly string[] {
    const call = put.mock.calls.find(
      ([request]) => new URL(request.url).pathname === path,
    );
    return call?.[2] ?? [];
  }

  test("stores each scope under its own type tag, so a publish retires only that scope", async () => {
    const { cache, put } = edgeStub();
    const h = await createHarness([taxonomyPlugin], { cache });
    await seedPost(h);

    await bodyOf(h, "/sitemap-post-1.xml");
    await bodyOf(h, "/sitemap-category-1.xml");
    await h.drainDeferred();

    // `t:post` is what an `entry:published` of a post purges, so publishing one
    // clears the post scope. The category scope rides its taxonomy's entry
    // types, which is what a term change purges.
    // Asserted against core's own purge vocabulary rather than a spelled-out
    // string: what makes this one caching story is that the set an
    // `entry:published` sweeps covers what the scope stored under.
    expect(tagsFor(put, "/sitemap-post-1.xml")).toContain(typeTag("post"));
    expect(entryPurgeTags("post", 1)).toEqual(
      expect.arrayContaining([typeTag("post")]),
    );
    expect(tagsFor(put, "/sitemap-category-1.xml")).toEqual(
      expect.arrayContaining([typeTag("post")]),
    );
    // And both carry the set-wide tag the indexing toggle purges by.
    expect(tagsFor(put, "/sitemap-post-1.xml")).toContain(SITEMAP_TAG);
  });

  test("declares a shared freshness window and serves the next request from the edge", async () => {
    const { cache, match, put } = edgeStub();
    const h = await createHarness([blogPlugin], { cache });
    await seedPost(h);

    const first = await h.dispatch(
      new Request("https://cms.example/sitemap-post-1.xml"),
    );
    const firstBody = await first.text();
    await h.drainDeferred();
    const second = await h.dispatch(
      new Request("https://cms.example/sitemap-post-1.xml"),
    );

    expect(first.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=3600",
    );
    expect(await second.text()).toBe(firstBody);
    expect(put).toHaveBeenCalledOnce();
    expect(match).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["the plugin's own group", "seo", true],
    ["the legacy site group", "site", true],
    ["an unrelated group", "mail", false],
  ])(
    "a settings save on %s %s the whole set",
    async (_label, group, purged) => {
      const { cache, purgeTags } = edgeStub();
      const h = await createHarness([blogPlugin, settingsSaver(group)], {
        cache,
      });

      await h.dispatch(new Request("https://cms.example/fire-settings-change"));
      await h.drainDeferred();

      expect(purgeTags.mock.calls.flatMap(([tags]) => [...tags])).toEqual(
        purged ? [SITEMAP_TAG] : [],
      );
    },
  );

  test("with no cache configured the sitemap still serves, generated per request", async () => {
    const h = await createHarness();
    await seedPost(h);

    const res = await h.dispatch(
      new Request("https://cms.example/sitemap-post-1.xml"),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain(
      "<loc>https://cms.example/post/hello</loc>",
    );
  });
});

describe("a scope held out of the index leaves the sitemap", () => {
  test("an entry type defaulted to noindex drops out of the index", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "seo",
      key: "type:post:indexable",
      value: false,
    });
    await seedPost(h);

    expect(await bodyOf(h, "/sitemap.xml")).not.toContain("sitemap-post-1.xml");
  });

  test("and its sub-sitemap serves an empty url-set", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "seo",
      key: "type:post:indexable",
      value: false,
    });
    await seedPost(h);

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain("<urlset");
    expect(body).not.toContain("<url>");
  });

  test("a taxonomy defaulted to noindex drops out too", async () => {
    const h = await createHarness([taxonomyPlugin]);
    await h.factory.setting.create({
      group: "seo",
      key: "taxonomy:category:indexable",
      value: false,
    });
    await h.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });
    await seedPost(h);

    const index = await bodyOf(h, "/sitemap.xml");

    expect(index).not.toContain("sitemap-category-1.xml");
    // The entry type is untouched — one scope leaving is not all of them.
    expect(index).toContain("sitemap-post-1.xml");
  });

  test("a type and a taxonomy sharing a name are told apart", async () => {
    const namesake = definePlugin("namesake", (ctx) => {
      ctx.registerEntryType("topic", { label: "Topics", isPublic: true });
      ctx.registerTermTaxonomy("topic", {
        label: "Topics",
        isHierarchical: false,
        entryTypes: ["topic"],
      });
    });
    const h = await createHarness([namesake]);
    await h.factory.setting.create({
      group: "seo",
      key: "taxonomy:topic:indexable",
      value: false,
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "topic",
      slug: "hello",
      title: "Hello",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    // The entry type keeps its scope; only the taxonomy was held out, and the
    // taxonomy never claimed a route because the type took the name first.
    expect(await bodyOf(h, "/sitemap.xml")).toContain("sitemap-topic-1.xml");
  });
});

describe("noindex keeps a page out of the sitemap", () => {
  test("an entry marked noindex is not listed", async () => {
    const h = await createHarness();
    await seedPost(h, { slug: "listed" });
    await seedPost(h, { slug: "hidden", meta: { seo_noindex: true } });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain("<loc>https://cms.example/post/listed</loc>");
    expect(body).not.toContain("/post/hidden");
  });

  test("an entry that answered false stays listed", async () => {
    const h = await createHarness();
    await seedPost(h, { slug: "listed", meta: { seo_noindex: false } });

    expect(await bodyOf(h, "/sitemap-post-1.xml")).toContain(
      "<loc>https://cms.example/post/listed</loc>",
    );
  });

  test("a bag holding something other than true stays listed", async () => {
    const h = await createHarness();
    // Everything the head's reader answers `false` to. The two have to agree,
    // or a page is indexable in its head and missing from the sitemap — and
    // `1` is the one a JSON extraction cannot tell from `true`.
    await seedPost(h, { slug: "texty", meta: { seo_noindex: "yes" } });
    await seedPost(h, { slug: "numeric", meta: { seo_noindex: 1 } });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain("<loc>https://cms.example/post/texty</loc>");
    expect(body).toContain("<loc>https://cms.example/post/numeric</loc>");
  });

  test("a scope whose every entry is hidden drops out of the index", async () => {
    const h = await createHarness();
    await seedPost(h, { slug: "hidden", meta: { seo_noindex: true } });

    const body = await bodyOf(h, "/sitemap.xml");

    expect(body).not.toContain("sitemap-post-1.xml");
  });

  test("a term marked noindex is not listed", async () => {
    const h = await createHarness([taxonomyPlugin]);
    await h.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });
    await h.factory.term.create({
      taxonomy: "category",
      name: "Secret",
      slug: "secret",
      meta: { seo_noindex: true },
    });

    const body = await bodyOf(h, "/sitemap-category-1.xml");

    expect(body).toContain("<loc>https://cms.example/category/news</loc>");
    expect(body).not.toContain("/category/secret");
  });
});
