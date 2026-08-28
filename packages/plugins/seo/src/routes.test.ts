import type {
  AnyPluginDescriptor,
  ConnectedCache,
  JsonValue,
  Logger,
} from "plumix";
import type { DispatcherHarness } from "plumix/test";
import { entryPurgeTags, typeTag } from "plumix";
import { entries, eq } from "plumix/db";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { afterEach, describe, expect, test, vi } from "vitest";

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

// A type whose pictures the sitemap has to find: two role-tagged media fields,
// declared raw rather than through the media plugin's builder, and a `media`
// lookup adapter standing in for its hydration — what the walk reads is the
// role and the hydrated `url`, so seeding those keeps this suite off a second
// plugin.
const picturePlugin = definePlugin("pictures", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
  ctx.registerEntryMetaBox("social", {
    label: "Social",
    entryTypes: ["post"],
    fields: [
      {
        key: "hero",
        label: "Hero",
        type: "json",
        inputType: "media",
        role: "featured",
        referenceTarget: { kind: "media" },
      },
      {
        key: "shareImage",
        label: "Share image",
        type: "json",
        inputType: "media",
        role: "ogImage",
        referenceTarget: { kind: "media" },
      },
      {
        key: "gallery",
        label: "Gallery",
        type: "json",
        inputType: "mediaList",
        role: "featured",
        referenceTarget: { kind: "media", multiple: true },
      },
    ],
  });
  ctx.registerLookupAdapter({
    kind: "media",
    capability: null,
    adapter: {
      list: () => Promise.resolve([]),
      hydrate: (_appCtx, { ids }) =>
        Promise.resolve(
          ids.map((id) => ({
            id,
            // A `doc`-prefixed id stands in for a non-image upload, a `rel`-
            // prefixed one for the worker-proxied serve path a deploy with no
            // public bucket URL hands back.
            mime: id.startsWith("doc") ? "application/pdf" : "image/png",
            url: id.startsWith("rel")
              ? `/_plumix/media/serve/${id}`
              : `https://cdn.example/${id}.png`,
          })),
        ),
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
  options: {
    readonly cache?: ConnectedCache;
    readonly basePath?: string;
    readonly logger?: Logger;
  } = {},
): Promise<DispatcherHarness> {
  return createDispatcherHarness({ plugins: [...plugins, seo()], ...options });
}

async function setSettings(
  h: DispatcherHarness,
  group: string,
  values: Readonly<Record<string, JsonValue>>,
): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await h.factory.setting.create({ group, key, value });
  }
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
    const h = await createHarness([blogPlugin], {
      basePath: "/custom-directory",
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

describe("an entry's pictures in the sitemap", () => {
  test("lists a role-tagged media field's image", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, { meta: { hero: "m1" } });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain(
      "<image:image><image:loc>https://cdn.example/m1.png</image:loc></image:image>",
    );
  });

  test("an entry with no picture is unaffected", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, { slug: "bare" });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain("<url><loc>https://cms.example/post/bare</loc>");
    expect(body).not.toContain("image");
  });

  test("lists every role-tagged field, the editor's own URL, and a list field's items", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, {
      meta: {
        hero: "m1",
        shareImage: "m2",
        gallery: ["m3", "m4"],
        seo_og_image: "https://cdn.example/typed.png",
      },
    });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain("https://cdn.example/m1.png");
    expect(body).toContain("https://cdn.example/m2.png");
    expect(body).toContain("https://cdn.example/m3.png");
    expect(body).toContain("https://cdn.example/m4.png");
    expect(body).toContain("https://cdn.example/typed.png");
  });

  test("absolutizes a picture served relative to the site", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, { meta: { hero: "rel1" } });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain(
      "<image:loc>https://cms.example/_plumix/media/serve/rel1</image:loc>",
    );
  });

  test("leaves out an upload that is not an image", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, { meta: { hero: "m1", gallery: ["doc1"] } });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain("https://cdn.example/m1.png");
    expect(body).not.toContain("doc1");
  });

  test("lists at most ten pictures for one entry", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, {
      meta: {
        gallery: Array.from({ length: 12 }, (_unused, at) => `g${String(at)}`),
      },
    });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body.match(/<image:image>/g)).toHaveLength(10);
  });

  test("lists one entry per picture even when two fields name the same one", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, { meta: { hero: "m1", shareImage: "m1" } });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body.match(/<image:image>/g)).toHaveLength(1);
  });

  test("a type with no media field costs no hydration", async () => {
    const hydrate = vi.fn(() => Promise.resolve([]));
    const noFields = definePlugin("no-fields", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerLookupAdapter({
        kind: "media",
        capability: null,
        adapter: { list: () => Promise.resolve([]), hydrate },
      });
    });
    const h = await createHarness([noFields]);
    await seedPost(h);

    await bodyOf(h, "/sitemap-post-1.xml");

    expect(hydrate).not.toHaveBeenCalled();
  });
});

describe("the sitemap stylesheet", () => {
  test("is served as XSL", async () => {
    const h = await createHarness();

    const res = await h.dispatch(
      new Request("https://cms.example/sitemap.xsl"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xsl");
    expect(await res.text()).toContain("<xsl:stylesheet");
  });

  test("is named by the index and by a sub-sitemap, after the XML declaration", async () => {
    const h = await createHarness();
    await seedPost(h);

    const index = await bodyOf(h, "/sitemap.xml");
    const sub = await bodyOf(h, "/sitemap-post-1.xml");
    const declared =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>';

    expect(index.startsWith(`${declared}<sitemapindex`)).toBe(true);
    expect(sub.startsWith(`${declared}<urlset`)).toBe(true);
  });

  test("is named at its base-prefixed path under a base path", async () => {
    const h = await createHarness([blogPlugin], {
      basePath: "/custom-directory",
    });

    const res = await h.dispatch(
      new Request("https://cms.example/custom-directory/sitemap.xml"),
    );

    expect(await res.text()).toContain('href="/custom-directory/sitemap.xsl"');
  });
});

describe("AI-crawler rules", () => {
  test("are absent until a site asks for them", async () => {
    const h = await createHarness();

    expect(await bodyOf(h, "/robots.txt")).toBe("User-agent: *\nDisallow:\n");
  });

  test("disallow the named agents while everything else keeps crawling", async () => {
    const h = await createHarness();
    await setSettings(h, "seo", { block_ai_crawlers: true });

    const body = await bodyOf(h, "/robots.txt");

    expect(body).toContain("User-agent: *\nDisallow:\n");
    expect(body).toContain("User-agent: GPTBot\n");
    expect(body).toContain("User-agent: ClaudeBot\n");
    expect(body.trimEnd().endsWith("Disallow: /")).toBe(true);
  });

  test("say nothing extra on a private site, which already disallows every agent", async () => {
    const h = await createHarness();
    await setSettings(h, "seo", {
      block_ai_crawlers: true,
      indexable: false,
    });

    expect(await bodyOf(h, "/robots.txt")).toBe("User-agent: *\nDisallow: /\n");
  });

  test("reach the seo:robots-txt filter with the rest of the body", async () => {
    const appender = definePlugin("robots-append", (ctx) => {
      ctx.addFilter("seo:robots-txt", (body) => `${body}\n# end\n`);
    });
    const h = await createHarness([blogPlugin, appender]);
    await setSettings(h, "seo", { block_ai_crawlers: true });

    const body = await bodyOf(h, "/robots.txt");

    expect(body).toContain("User-agent: GPTBot");
    expect(body.endsWith("# end\n")).toBe(true);
  });
});

describe("/llms.txt", () => {
  async function llms(
    h: DispatcherHarness,
  ): Promise<{ readonly type: string | null; readonly body: string }> {
    const res = await h.dispatch(new Request("https://cms.example/llms.txt"));
    return { type: res.headers.get("content-type"), body: await res.text() };
  }

  test("names the site and points at the sitemap", async () => {
    const h = await createHarness();
    await setSettings(h, "site", {
      title: "Acme Blog",
      tagline: "Things we built.",
    });

    const { type, body } = await llms(h);

    expect(type).toContain("text/markdown");
    expect(body).toContain("# Acme Blog");
    expect(body).toContain("> Things we built.");
    expect(body).toContain("https://cms.example/sitemap.xml");
  });

  test("falls back to the host when the site has no title", async () => {
    const h = await createHarness();

    expect((await llms(h)).body.startsWith("# cms.example")).toBe(true);
  });

  test("offers no map while the site is held out of the index", async () => {
    const h = await createHarness();
    await setSettings(h, "seo", { indexable: false });

    expect((await llms(h)).body).not.toContain("/sitemap.xml");
  });

  test("offers no map to a site that blocks AI crawlers", async () => {
    const h = await createHarness();
    await setSettings(h, "seo", { block_ai_crawlers: true });

    const { body } = await llms(h);

    expect(body).not.toContain("/sitemap.xml");
    expect(body).toContain("not offered");
  });

  test("is base-prefixed under a base path", async () => {
    const h = await createHarness([blogPlugin], {
      basePath: "/custom-directory",
    });

    const res = await h.dispatch(
      new Request("https://cms.example/custom-directory/llms.txt"),
    );

    expect(await res.text()).toContain(
      "https://cms.example/custom-directory/sitemap.xml",
    );
  });

  test("the seo:llms-txt filter can rewrite the body", async () => {
    const rewrite = definePlugin("llms-test", (ctx) => {
      ctx.addFilter("seo:llms-txt", (body) => `${body}\n## Docs\n`);
    });
    const h = await createHarness([blogPlugin, rewrite]);

    expect((await llms(h)).body.endsWith("## Docs\n")).toBe(true);
  });
});

// The publish RPC fires its lifecycle action mid-request; this stands in for
// it, so a subscriber runs where it really would — inside a request, with a
// context to defer through.
type LifecycleAction = "entry:published" | "entry:updated" | "both";

function lifecycleFirer(action: LifecycleAction) {
  return definePlugin("lifecycle-firer", (ctx) => {
    ctx.registerPublicRoute({
      path: "/fire-lifecycle/:slug",
      handler: async (_request, appCtx, params) => {
        const [entry] = await appCtx.db
          .select()
          .from(entries)
          .where(eq(entries.slug, params.slug ?? ""));
        if (entry === undefined) {
          return new Response("no entry", { status: 404 });
        }
        // Fired one name at a time: the two carry different argument lists, so
        // a union of them narrows to nothing. `both` is the pair a real
        // publish transition fires, in the order `entry.update` fires them.
        if (action !== "entry:published") {
          await appCtx.hooks.doAction("entry:updated", entry, entry);
        }
        if (action !== "entry:updated") {
          await appCtx.hooks.doAction("entry:published", entry);
        }
        return new Response("ok");
      },
    });
  });
}

describe("IndexNow", () => {
  const KEY = "0123456789abcdef0123456789abcdef";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubbedFetch(): ReturnType<typeof vi.fn> {
    const fetch = vi.fn(() =>
      Promise.resolve(new Response("", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  async function publish(h: DispatcherHarness): Promise<Response> {
    const res = await h.dispatch(
      new Request("https://cms.example/fire-lifecycle/hello"),
    );
    await h.drainDeferred();
    return res;
  }

  function submitted(fetch: ReturnType<typeof vi.fn>): {
    readonly url: string;
    readonly body: unknown;
  } {
    const [url, init] = fetch.mock.calls[0] as [string, { body: string }];
    return { url, body: JSON.parse(init.body) as unknown };
  }

  async function harnessWithKey(
    action: LifecycleAction = "entry:published",
  ): Promise<DispatcherHarness> {
    const h = await createHarness([blogPlugin, lifecycleFirer(action)]);
    await setSettings(h, "seo", { indexnow_key: KEY });
    return h;
  }

  test("is off until a key is configured", async () => {
    const fetch = stubbedFetch();
    const h = await createHarness([
      blogPlugin,
      lifecycleFirer("entry:published"),
    ]);
    await seedPost(h);

    await publish(h);

    expect(fetch).not.toHaveBeenCalled();
  });

  test("submits a published entry's URL, its key and where the key is served", async () => {
    const fetch = stubbedFetch();
    const h = await harnessWithKey();
    await seedPost(h);

    await publish(h);

    const { url, body } = submitted(fetch);
    expect(fetch).toHaveBeenCalledOnce();
    expect(url).toBe("https://api.indexnow.org/indexnow");
    expect(body).toEqual({
      host: "cms.example",
      key: KEY,
      keyLocation: "https://cms.example/indexnow-key.txt",
      urlList: ["https://cms.example/post/hello"],
    });
  });

  test("submits an updated entry too", async () => {
    const fetch = stubbedFetch();
    const h = await harnessWithKey("entry:updated");
    await seedPost(h);

    await publish(h);

    expect(fetch).toHaveBeenCalledOnce();
  });

  test("submits once for a publish that fires both update and publish", async () => {
    const fetch = stubbedFetch();
    const h = await harnessWithKey("both");
    await seedPost(h);

    await publish(h);

    expect(fetch).toHaveBeenCalledOnce();
  });

  test("reports an endpoint that refuses the key", async () => {
    const warn = vi.fn();
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 403 }))),
    );
    const h = await createHarness(
      [blogPlugin, lifecycleFirer("entry:published")],
      { logger },
    );
    await setSettings(h, "seo", { indexnow_key: KEY });
    await seedPost(h);

    await publish(h);

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[1]).toEqual({ status: 403 });
  });

  test("says nothing about an entry an editor hid", async () => {
    const fetch = stubbedFetch();
    const h = await harnessWithKey();
    await seedPost(h, { meta: { seo_noindex: true } });

    await publish(h);

    expect(fetch).not.toHaveBeenCalled();
  });

  test("says nothing about a draft", async () => {
    const fetch = stubbedFetch();
    const h = await harnessWithKey("entry:updated");
    await seedPost(h, { status: "draft" });

    await publish(h);

    expect(fetch).not.toHaveBeenCalled();
  });

  test("says nothing about a type the site defaulted out of the index", async () => {
    const fetch = stubbedFetch();
    const h = await harnessWithKey();
    await setSettings(h, "seo", { "type:post:indexable": false });
    await seedPost(h);

    await publish(h);

    expect(fetch).not.toHaveBeenCalled();
  });

  test("says nothing at all while the site is held out of the index", async () => {
    const fetch = stubbedFetch();
    const h = await harnessWithKey();
    await setSettings(h, "seo", { indexable: false });
    await seedPost(h);

    await publish(h);

    expect(fetch).not.toHaveBeenCalled();
  });

  test("runs after the response, never during it", async () => {
    const fetch = stubbedFetch();
    const h = await harnessWithKey();
    await seedPost(h);

    const res = await h.dispatch(
      new Request("https://cms.example/fire-lifecycle/hello"),
    );

    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    await h.drainDeferred();
    expect(fetch).toHaveBeenCalledOnce();
  });

  test("an endpoint that errors does not fail the publish", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error("upstream is down")));
    vi.stubGlobal("fetch", fetch);
    const h = await harnessWithKey();
    await seedPost(h);

    const res = await publish(h);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  test("serves the key file the submission points at", async () => {
    const h = await harnessWithKey();

    const res = await h.dispatch(
      new Request("https://cms.example/indexnow-key.txt"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe(KEY);
  });

  test("has no key file to serve until a key is configured", async () => {
    const h = await createHarness();

    const res = await h.dispatch(
      new Request("https://cms.example/indexnow-key.txt"),
    );

    expect(res.status).toBe(404);
  });
});
