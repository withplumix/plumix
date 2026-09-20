import type {
  AnyPluginDescriptor,
  CdnStore,
  ConnectedCdn,
  JsonValue,
} from "plumix";
import type { MetaBoxField } from "plumix/fields";
import type { ImageRoleName, Logger, PluginSetupContext } from "plumix/plugin";
import type {
  CreateDispatcherHarnessOptions,
  DispatcherHarness,
} from "plumix/test";
import { entryPurgeTags, eq, typeTag } from "plumix/db";
import { definePlugin } from "plumix/plugin";
import { entries } from "plumix/schema";
import { createDispatcherHarness } from "plumix/test";
import { defineTheme, fallback } from "plumix/theme";
import { afterEach, describe, expect, test, vi } from "vitest";

import { seo } from "./index.js";
import { SITEMAP_TAG } from "./routes.js";

// The sitemap lists every role an entry carries, not a pair core happens to
// ship — so this suite declares one of its own.
declare module "plumix" {
  interface ImageRoles {
    hero: true;
  }
}

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

// A type whose pictures the sitemap has to find: role-tagged media fields,
// declared raw rather than through the media plugin's builder, and a `media`
// lookup adapter standing in for its hydration — what the sitemap reads is the
// role and the image the adapter makes of the payload, so seeding those keeps
// this suite off a second plugin. `shareCount` extra `ogImage` fields,
// `share0`…, give one role more than one field to answer from.
//
// `featured` sits inside a group, which is where an appearance box tends to
// put it, and `hero` is a role this suite registers rather than one core ships.
const picturePluginWith = (shareCount: number, hydrate?: LookupHydrate) =>
  definePlugin("pictures", (ctx) => {
    ctx.registerImageRole("hero", { single: true });
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
          key: "appearance",
          label: "Appearance",
          type: "json",
          inputType: "group",
          fields: [pictureField("hero", "featured")],
        },
        pictureField("heroShot", "hero"),
        pictureField("shareImage", "ogImage"),
        ...Array.from({ length: shareCount }, (_unused, at) =>
          pictureField(`share${String(at)}`, "ogImage"),
        ),
      ],
    });
    registerPictureAdapter(ctx, hydrate);
  });

function pictureField(key: string, role: ImageRoleName): MetaBoxField {
  return {
    key,
    label: key,
    type: "json",
    inputType: "media",
    role,
    referenceTarget: { kind: "media" },
  };
}

const picturePlugin = picturePluginWith(0);

// A `doc`-prefixed id stands in for a non-image upload, a `rel`-prefixed one
// for the worker-proxied serve path a deploy with no public bucket URL hands
// back, and a `blank`-prefixed one for an adapter that answers with an image
// carrying no URL.
interface Upload {
  readonly id: string;
  readonly mime: string;
  readonly url: string;
}

function uploadUrl(id: string): string {
  if (id.startsWith("blank")) return "";
  if (id.startsWith("rel")) return `/_plumix/media/serve/${id}`;
  return `https://cdn.example/${id}.png`;
}

const upload = (id: string): Upload => ({
  id,
  mime: id.startsWith("doc") ? "application/pdf" : "image/png",
  url: uploadUrl(id),
});

/** What a spying suite substitutes for the adapter's own batched read. */
type LookupHydrate = (
  appCtx: unknown,
  options: { readonly ids: readonly string[] },
) => Promise<readonly Upload[]>;

const hydrateUploads: LookupHydrate = (_appCtx, { ids }) =>
  Promise.resolve(ids.map(upload));

function registerPictureAdapter(
  ctx: PluginSetupContext,
  hydrate: LookupHydrate = hydrateUploads,
): void {
  ctx.registerLookupAdapter({
    kind: "media",
    capability: null,
    adapter: {
      list: () => Promise.resolve([]),
      hydrate,
      // Whether a payload is a picture is the adapter's own answer — the
      // sitemap asks for an image and gets nothing for a PDF, rather than
      // hydrating everything and sniffing the mime itself.
      image: ({ url, mime }: Upload) =>
        mime.startsWith("image/") ? { url, alt: null } : null,
    },
  });
}

// A settings save fires its action mid-request, which is where the purge
// accumulator lives; this stands in for the RPC that would normally fire it.
function settingsSaver(group: string): AnyPluginDescriptor {
  return definePlugin("settings-saver", (ctx) => {
    ctx.registerPublicRoute({
      path: "/fire-settings-change",
      handler: async (_request, appCtx) => {
        await appCtx.hooks.doAction(
          "settings:group_changed",
          { group, set: { indexable: false }, removed: [] },
          appCtx,
        );
        return new Response("ok");
      },
    });
  });
}

function createHarness(
  plugins: readonly AnyPluginDescriptor[] = [blogPlugin],
  options: {
    readonly cdn?: ConnectedCdn;
    readonly basePath?: string;
    readonly logger?: Logger;
    readonly telemetry?: CreateDispatcherHarnessOptions["telemetry"];
    readonly theme?: CreateDispatcherHarnessOptions["theme"];
  } = {},
): Promise<DispatcherHarness> {
  return createDispatcherHarness({ plugins: [...plugins, seo()], ...options });
}

// `plumix` exports no span type; this is the part of one a query count reads.
interface SpanTree {
  readonly name: string;
  readonly children: readonly SpanTree[];
}

function flattenSpans(spans: readonly SpanTree[]): SpanTree[] {
  return spans.flatMap((span) => [span, ...flattenSpans(span.children)]);
}

function countDbSpans(spans: readonly SpanTree[]): number {
  return flattenSpans(spans).filter((span) => span.name.startsWith("db: "))
    .length;
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
    expect(await res.text()).toBe(
      "User-agent: *\nDisallow:\n\nSitemap: https://cms.example/sitemap.xml\n",
    );
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

  test("a page of nested entries costs the same queries however many it holds", async () => {
    const pagesPlugin = definePlugin("pages", (ctx) => {
      ctx.registerEntryType("page", {
        label: "Pages",
        isPublic: true,
        isHierarchical: true,
      });
    });

    // Each child sits under its own parent, so a per-row ancestor walk would
    // add one query per child.
    async function sitemapOfNestedPages(
      children: number,
    ): Promise<{ readonly queries: number; readonly body: string }> {
      let queries = 0;
      const h = await createHarness([pagesPlugin], {
        telemetry: {
          consumers: [
            {
              id: "query-count",
              onRequestEnd: (snapshot) => {
                queries = countDbSpans(snapshot.spans);
              },
            },
          ],
        },
      });
      const author = await h.seedUser("admin");
      for (let i = 0; i < children; i++) {
        const parent = await h.factory.entry.create({
          type: "page",
          slug: `parent-${String(i)}`,
          title: "Parent",
          content: null,
          status: "published",
          authorId: author.id,
        });
        await h.factory.entry.create({
          type: "page",
          slug: `child-${String(i)}`,
          title: "Child",
          content: null,
          status: "published",
          authorId: author.id,
          parentId: parent.id,
        });
      }
      const body = await bodyOf(h, "/sitemap-page-1.xml");
      await h.drainDeferred();
      return { queries, body };
    }

    const one = await sitemapOfNestedPages(1);
    const four = await sitemapOfNestedPages(4);

    expect(four.body).toContain(
      "<loc>https://cms.example/page/parent-3/child-3</loc>",
    );
    expect(one.queries).toBeGreaterThan(0);
    expect(four.queries).toBe(one.queries);
  });

  test("a page of nested terms costs the same queries however many it holds", async () => {
    const nestedTaxonomyPlugin = definePlugin("nested-taxo", (ctx) => {
      ctx.registerTermTaxonomy("category", {
        label: "Categories",
        isHierarchical: true,
      });
    });

    async function sitemapOfNestedTerms(
      children: number,
    ): Promise<{ readonly queries: number; readonly body: string }> {
      let queries = 0;
      const h = await createHarness([nestedTaxonomyPlugin], {
        telemetry: {
          consumers: [
            {
              id: "query-count",
              onRequestEnd: (snapshot) => {
                queries = countDbSpans(snapshot.spans);
              },
            },
          ],
        },
      });
      for (let i = 0; i < children; i++) {
        const parent = await h.factory.term.create({
          taxonomy: "category",
          name: "Parent",
          slug: `parent-${String(i)}`,
        });
        await h.factory.term.create({
          taxonomy: "category",
          name: "Child",
          slug: `child-${String(i)}`,
          parentId: parent.id,
        });
      }
      const body = await bodyOf(h, "/sitemap-category-1.xml");
      await h.drainDeferred();
      return { queries, body };
    }

    const one = await sitemapOfNestedTerms(1);
    const four = await sitemapOfNestedTerms(4);

    expect(four.body).toContain(
      "<loc>https://cms.example/category/parent-3/child-3</loc>",
    );
    expect(one.queries).toBeGreaterThan(0);
    expect(four.queries).toBe(one.queries);
  });
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
  function cdnStub() {
    const entries = new Map<string, Response>();
    const put = vi.fn<CdnStore["put"]>((request, response) => {
      entries.set(request.url, response);
      return Promise.resolve();
    });
    const match = vi.fn<CdnStore["match"]>((request) =>
      Promise.resolve(entries.get(request.url)?.clone()),
    );
    const purgeTags = vi.fn<NonNullable<ConnectedCdn["purgeTags"]>>(() =>
      Promise.resolve(),
    );
    const cdn: ConnectedCdn = {
      decorate: (response) => response,
      store: { match, put },
      purgeTags,
    };
    return { cdn, match, put, purgeTags };
  }

  function tagsFor(
    put: ReturnType<typeof cdnStub>["put"],
    path: string,
  ): readonly string[] {
    const call = put.mock.calls.find(
      ([request]) => new URL(request.url).pathname === path,
    );
    return call?.[2] ?? [];
  }

  test("stores each scope under its own type tag, so a publish retires only that scope", async () => {
    const { cdn, put } = cdnStub();
    const h = await createHarness([taxonomyPlugin], { cdn });
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

  test("names only its own tags, not one per picture it lists", async () => {
    // Resolving image roles hydrates through the path that folds an embedded
    // cache tag per payload into the *page* accumulator — bounded by a page
    // for the render, and not for a sitemap. A registered public route is
    // stored under what its handler declared with `tagCdnEntry` instead, which
    // never reads that accumulator, so a page of 1,000 entries still carries
    // the two tags a publish purges the scope by. #2511 owns whether the bulk
    // primitive should stop accumulating at all.
    const { cdn, put } = cdnStub();
    const h = await createHarness([picturePlugin], { cdn });
    await seedPost(h, { meta: { appearance: { hero: "m1" } } });

    await bodyOf(h, "/sitemap-post-1.xml");
    await h.drainDeferred();

    expect(tagsFor(put, "/sitemap-post-1.xml")).toEqual([
      SITEMAP_TAG,
      typeTag("post"),
    ]);
  });

  test("declares a shared freshness window and serves the next request from the edge", async () => {
    const { cdn, match, put } = cdnStub();
    const h = await createHarness([blogPlugin], { cdn });
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

  // Every SEO group rewrites something a cached response already says, so a
  // save retires the sitemap set and the content pages of every registered
  // type — the latter by type tag, since the cdn has no site-wide one.
  test.each([
    ["the plugin's own group", "seo", true],
    ["the verification group", "seo_verification", true],
    ["the robots.txt group", "seo_robots", true],
    ["the legacy site group", "site", true],
    ["an unrelated group", "mail", false],
  ])(
    "a settings save on %s %s the cached set",
    async (_label, group, purged) => {
      const { cdn, purgeTags } = cdnStub();
      const h = await createHarness([blogPlugin, settingsSaver(group)], {
        cdn,
      });

      await h.dispatch(new Request("https://cms.example/fire-settings-change"));
      await h.drainDeferred();

      expect(purgeTags.mock.calls.flatMap(([tags]) => [...tags])).toEqual(
        purged ? [SITEMAP_TAG, typeTag("post")] : [],
      );
    },
  );

  test("with no cdn configured the sitemap still serves, generated per request", async () => {
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
    // The sitemap half of what the agreement table holds all three surfaces
    // to: only a stored `true` hides a page, so a bag holding anything else
    // stays listed. `1` is the one a JSON extraction cannot tell from `true`,
    // which is why the predicate asks `json_type` instead.
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
  // The `featured` role sits inside a group, so every seed that fills it also
  // asserts a nested role field reaches the sitemap.
  const featured = (id: string) => ({ appearance: { hero: id } });

  test("lists a role-tagged media field's image", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, { meta: featured("m1") });

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

  test("lists a role this site registered, not just the two core ships", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, { meta: { heroShot: "m3" } });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain(
      "<image:image><image:loc>https://cdn.example/m3.png</image:loc></image:image>",
    );
  });

  test("lists every role and the editor's own URL", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, {
      meta: {
        ...featured("m1"),
        heroShot: "m3",
        shareImage: "m2",
        seo_og_image: "https://cdn.example/typed.png",
      },
    });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain("https://cdn.example/m1.png");
    expect(body).toContain("https://cdn.example/m2.png");
    expect(body).toContain("https://cdn.example/m3.png");
    expect(body).toContain("https://cdn.example/typed.png");
  });

  test("absolutizes a picture served relative to the site", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, { meta: featured("rel1") });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain(
      "<image:loc>https://cms.example/_plumix/media/serve/rel1</image:loc>",
    );
  });

  test("leaves out an upload the adapter does not read as an image", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, { meta: { ...featured("m1"), shareImage: "doc1" } });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain("https://cdn.example/m1.png");
    expect(body).not.toContain("doc1");
  });

  test("a role with many fields lists the first of them that resolves", async () => {
    // One image per role is the ceiling a role sets, and it is what replaced
    // the per-entry cap the hand-rolled walk needed: a role names the entity's
    // picture, so a type tagging thirteen fields with it still names one.
    const h = await createHarness([picturePluginWith(12)]);
    await seedPost(h, {
      meta: {
        shareImage: "doc0",
        ...Object.fromEntries(
          Array.from({ length: 12 }, (_unused, at): [string, string] => [
            `share${String(at)}`,
            `g${String(at)}`,
          ]),
        ),
      },
    });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    // `shareImage` is declared first but hydrates to a PDF, so the role falls
    // through to the next field rather than answering with nothing.
    expect(body.match(/<image:image>/g)).toHaveLength(1);
    expect(body).toContain("https://cdn.example/g0.png");
  });

  test("drops an image whose URL is empty rather than listing the site root", async () => {
    // `URL.parse("", origin)` resolves to the origin, so an adapter handing
    // back a blank URL would put the homepage in the picture list. The
    // first-party media adapter refuses that payload; a third-party one need
    // not, and the sitemap is what would publish the mistake.
    const h = await createHarness([picturePlugin]);
    await seedPost(h, { slug: "bare", meta: featured("blank1") });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body).toContain("<url><loc>https://cms.example/post/bare</loc>");
    expect(body).not.toContain("<image:image>");
  });

  test("lists one entry per picture even when two roles name the same one", async () => {
    const h = await createHarness([picturePlugin]);
    await seedPost(h, { meta: { ...featured("m1"), shareImage: "m1" } });

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body.match(/<image:image>/g)).toHaveLength(1);
  });

  test("a whole page of entries costs one hydration, not one per entry", async () => {
    const hydrate = vi.fn<LookupHydrate>(hydrateUploads);
    const h = await createHarness([picturePluginWith(0, hydrate)]);
    for (let at = 0; at < 5; at++) {
      await seedPost(h, {
        slug: `post-${String(at)}`,
        meta: featured(`m${String(at)}`),
      });
    }

    const body = await bodyOf(h, "/sitemap-post-1.xml");

    expect(body.match(/<image:image>/g)).toHaveLength(5);
    expect(hydrate).toHaveBeenCalledTimes(1);
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

    expect(await bodyOf(h, "/robots.txt")).toBe(
      "User-agent: *\nDisallow:\n\nSitemap: https://cms.example/sitemap.xml\n",
    );
  });

  test("disallow the named agents while everything else keeps crawling", async () => {
    const h = await createHarness();
    await setSettings(h, "seo", { block_ai_crawlers: true });

    const body = await bodyOf(h, "/robots.txt");

    expect(body).toContain("User-agent: *\nDisallow:\n");
    expect(body).toContain("User-agent: GPTBot\n");
    expect(body).toContain("User-agent: ClaudeBot\n");
    // One `Disallow` closing the whole group, whatever follows it.
    expect(body).toContain("User-agent: YouBot\nDisallow: /\n");
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
          await appCtx.hooks.doAction("entry:updated", entry, entry, appCtx);
        }
        if (action !== "entry:updated") {
          await appCtx.hooks.doAction("entry:published", entry, appCtx);
        }
        return new Response("ok");
      },
    });
  });
}

const KEY = "0123456789abcdef0123456789abcdef";

function stubbedFetch(): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(() => Promise.resolve(new Response("", { status: 200 })));
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

describe("IndexNow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

// The head asks `indexable` of one page, a sub-sitemap asks the same arms of
// whole tables, and IndexNow asks them inline. This table holds the three to
// one answer: an arm dropped from any of them fails a row here, and an arm
// added to `indexable` needs a row of its own. Which scopes the index lists
// is held by "a scope held out of the index leaves the sitemap".
describe("the head, the sitemap and IndexNow agree on indexability", () => {
  const theme = defineTheme({ templates: [fallback(() => null)] });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cases: readonly {
    readonly arm: string;
    readonly subject: "entry" | "term";
    readonly settings?: Readonly<Record<string, JsonValue>>;
    readonly meta?: Record<string, JsonValue>;
    readonly indexable: boolean;
  }[] = [
    { arm: "default", subject: "entry", indexable: true },
    { arm: "default", subject: "term", indexable: true },
    {
      arm: "site_private",
      subject: "entry",
      settings: { indexable: false },
      indexable: false,
    },
    {
      arm: "site_private",
      subject: "term",
      settings: { indexable: false },
      indexable: false,
    },
    {
      arm: "entry_override",
      subject: "entry",
      meta: { seo_noindex: true },
      indexable: false,
    },
    {
      arm: "entry_override",
      subject: "term",
      meta: { seo_noindex: true },
      indexable: false,
    },
    // A bag holding a token the write path would have settled — only a direct
    // write or an import puts one there. All three read it as stored, so the
    // page stays indexable rather than being hidden from two surfaces and
    // listed by the third.
    {
      arm: "numeric_token",
      subject: "entry",
      meta: { seo_noindex: 1 },
      indexable: true,
    },
    {
      arm: "string_token",
      subject: "term",
      meta: { seo_noindex: "true" },
      indexable: true,
    },
    {
      arm: "type_default",
      subject: "entry",
      settings: { "type:post:indexable": false },
      indexable: false,
    },
    {
      arm: "taxonomy_default",
      subject: "term",
      settings: { "taxonomy:category:indexable": false },
      indexable: false,
    },
  ];

  test.each(cases)(
    "$arm on a $subject",
    async ({ subject, settings = {}, meta, indexable }) => {
      const fetch = stubbedFetch();
      // A submission that throws is swallowed into a warning, which would
      // otherwise read here as an entry nobody announced.
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const h = await createHarness(
        [taxonomyPlugin, lifecycleFirer("entry:published")],
        { theme, logger },
      );
      await setSettings(h, "seo", { indexnow_key: KEY, ...settings });
      await seedPost(h, subject === "entry" && meta ? { meta } : {});
      await h.factory.term.create({
        taxonomy: "category",
        name: "News",
        slug: "news",
        ...(subject === "term" && meta ? { meta } : {}),
      });

      const [path, sitemap] =
        subject === "entry"
          ? ["/post/hello", "/sitemap-post-1.xml"]
          : ["/category/news", "/sitemap-category-1.xml"];
      // Every request has to land: a 404 is `noindex`, lists nothing and
      // announces nothing, so a broken route would pass each `false` row.
      const page = await h.dispatch(new Request(`https://cms.example${path}`));
      const listing = await h.dispatch(
        new Request(`https://cms.example${sitemap}`),
      );
      const statuses = [page.status, listing.status];
      const robots = /<meta name="robots" content="([^"]*)"/.exec(
        await page.text(),
      )?.[1];
      const listed = (await listing.text()).includes(
        `<loc>https://cms.example${path}</loc>`,
      );

      // IndexNow announces entries only; a term archive has no submission to
      // agree or disagree with.
      let announced: boolean | null = null;
      if (subject === "entry") {
        statuses.push((await publish(h)).status);
        announced = fetch.mock.calls.some(
          (call) => call[0] === "https://api.indexnow.org/indexnow",
        );
      }

      expect(statuses.filter((status) => status !== 200)).toEqual([]);
      expect({
        head: robots === undefined ? undefined : !robots.includes("noindex"),
        sitemap: listed,
        indexNow: announced,
        warnings: logger.warn.mock.calls,
      }).toEqual({
        head: indexable,
        sitemap: indexable,
        indexNow: subject === "entry" ? indexable : null,
        warnings: [],
      });
    },
  );
});

describe("the robots.txt editor", () => {
  async function seedRobots(
    h: DispatcherHarness,
    value: string,
  ): Promise<void> {
    await h.factory.setting.create({
      group: "seo_robots",
      key: "robots_txt",
      value,
    });
  }

  test("edited content replaces the generated body", async () => {
    const h = await createHarness();
    await seedRobots(h, "User-agent: GPTBot\nDisallow: /\n");

    expect(await bodyOf(h, "/robots.txt")).toContain("User-agent: GPTBot");
  });

  test("a sitemap reference survives editing", async () => {
    const h = await createHarness();
    await seedRobots(h, "User-agent: *\nDisallow: /private\n");

    expect(await bodyOf(h, "/robots.txt")).toContain(
      "Sitemap: https://cms.example/sitemap.xml",
    );
  });

  test("a sitemap line the author wrote is not written twice", async () => {
    const h = await createHarness();
    await seedRobots(h, "Sitemap: https://cdn.example/sitemap.xml\n");

    const body = await bodyOf(h, "/robots.txt");

    expect(body.match(/Sitemap:/g)).toHaveLength(1);
    expect(body).toContain("https://cdn.example/sitemap.xml");
  });

  test("the AI-crawler group is composed onto edited rules", async () => {
    const h = await createHarness();
    await setSettings(h, "seo", { block_ai_crawlers: true });
    await seedRobots(h, "User-agent: *\nDisallow: /private\n");

    const body = await bodyOf(h, "/robots.txt");

    // Two site-wide answers with their own toggles, so an edit replaces the
    // rules an author writes and neither of the answers around them.
    expect(body).toContain("Disallow: /private");
    expect(body).toContain("User-agent: GPTBot\n");
    expect(body).toContain("Sitemap: https://cms.example/sitemap.xml");
  });

  test("a private site disallows all crawling whatever the editor holds", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "seo",
      key: "indexable",
      value: false,
    });
    await seedRobots(h, "User-agent: *\nAllow: /\n");

    expect(await bodyOf(h, "/robots.txt")).toBe("User-agent: *\nDisallow: /\n");
  });
});
