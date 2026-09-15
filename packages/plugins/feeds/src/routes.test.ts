import type { AnyPluginDescriptor, CdnStore, ConnectedCdn } from "plumix";
import type { DispatcherHarness } from "plumix/test";
import { typeTag } from "plumix";
import { entries, eq } from "plumix/db";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test, vi } from "vitest";

import { feeds } from "./index.js";
import { FEED_TAG } from "./respond.js";

// Every suite below installs the plugin over the host plugin it syndicates:
// the plugin claims its routes in `afterSetup`, so what it serves is decided
// by what the site registered, not by what the request path looks like.
function harness(
  ...plugins: readonly AnyPluginDescriptor[]
): Promise<DispatcherHarness> {
  return createDispatcherHarness({ plugins: [...plugins, feeds()] });
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

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

const blogWithTaxonomyPlugin = definePlugin("blog-tax", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
  ctx.registerTermTaxonomy("category", {
    label: "Categories",
    entryTypes: ["post"],
  });
});

async function seedPost(
  h: DispatcherHarness,
  slug: string,
  title: string,
  status: "published" | "draft" = "published",
): Promise<void> {
  const author = await h.seedUser("admin");
  await h.factory.entry.create({
    type: "post",
    slug,
    title,
    content: null,
    status,
    authorId: author.id,
  });
}

describe("feed routes", () => {
  test("GET /feed returns RSS2 for recent published posts", async () => {
    const h = await harness(blogPlugin);
    await seedPost(h, "hello", "Hello World");

    const res = await h.fetch("/feed");
    res.assertStatus(200);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const body = await res.text();
    expect(body).toContain('<rss version="2.0"');
    expect(body).toContain("<title>Hello World</title>");
    expect(body).toContain("<link>https://cms.example/post/hello</link>");
  });

  test("GET /feed/atom returns an Atom feed", async () => {
    const h = await harness(blogPlugin);
    await seedPost(h, "hello", "Hello World");

    const res = await h.fetch("/feed/atom");
    res.assertStatus(200);
    expect(res.headers.get("content-type")).toContain("application/atom+xml");
    const body = await res.text();
    expect(body).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(body).toContain("<id>https://cms.example/feed/atom</id>");
    expect(body).toContain("<title>Hello World</title>");
  });

  test("GET /<type>/feed returns the type-scoped feed", async () => {
    const h = await harness(blogPlugin);
    await seedPost(h, "hello", "Hello World");

    const rss = await h.fetch("/post/feed");
    rss.assertStatus(200);
    expect(await rss.text()).toContain(
      '<atom:link href="https://cms.example/post/feed" rel="self"',
    );

    const atom = await h.fetch("/post/feed/atom");
    atom.assertStatus(200);
    expect(await atom.text()).toContain(
      "<id>https://cms.example/post/feed/atom</id>",
    );
  });

  test("only published entries appear in the feed", async () => {
    const h = await harness(blogPlugin);
    await seedPost(h, "live", "Live Post", "published");
    await seedPost(h, "wip", "Draft Post", "draft");

    const body = await (await h.fetch("/feed")).text();
    expect(body).toContain("Live Post");
    expect(body).not.toContain("Draft Post");
  });

  test("an unknown entry type 404s", async () => {
    const h = await harness(blogPlugin);
    const res = await h.fetch("/widget/feed");
    res.assertStatus(404);
  });

  test("the feed:items filter can adjust the item list", async () => {
    const h = await harness(blogPlugin);
    await seedPost(h, "hello", "Hello World");
    h.spyFilter("feed:items").override(() => []);

    const body = await (await h.fetch("/feed")).text();
    expect(body).not.toContain("<item>");
  });

  // The per-scope hrefs are unit-tested in `discovery.test.ts`; this is the
  // end-to-end proof that the `render:document` subscriber is installed.
  test("feed discovery <link rel=alternate> tags appear in the head", async () => {
    const h = await harness(blogPlugin);
    await seedPost(h, "hello", "Hello World");

    const body = await (await h.fetch("/")).text();
    expect(body).toContain(
      '<link rel="alternate" type="application/rss+xml" href="https://cms.example/feed"',
    );
    expect(body).toContain(
      '<link rel="alternate" type="application/atom+xml" href="https://cms.example/feed/atom"',
    );
  });

  test("a feed of nested entries costs the same queries however many it holds", async () => {
    const pagesPlugin = definePlugin("pages", (ctx) => {
      ctx.registerEntryType("page", {
        label: "Pages",
        isPublic: true,
        isHierarchical: true,
      });
    });

    // Each child sits under its own parent, so a per-row ancestor walk would
    // add one query per child.
    async function feedOfNestedPages(
      children: number,
    ): Promise<{ readonly queries: number; readonly body: string }> {
      let queries = 0;
      const h = await createDispatcherHarness({
        plugins: [pagesPlugin, feeds()],
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
      const body = await (await h.fetch("/page/feed")).text();
      await h.drainDeferred();
      return { queries, body };
    }

    const one = await feedOfNestedPages(1);
    const four = await feedOfNestedPages(4);

    expect(four.body).toContain(
      "<link>https://cms.example/page/parent-3/child-3</link>",
    );
    expect(one.queries).toBeGreaterThan(0);
    expect(four.queries).toBe(one.queries);
  });
});

describe("term feed routes", () => {
  async function seedTermFeed(): Promise<DispatcherHarness> {
    const h = await harness(blogWithTaxonomyPlugin);
    const author = await h.seedUser("admin");
    const term = await h.factory.category.create({
      slug: "news",
      name: "News",
    });
    const tagged = await h.factory.entry.create({
      type: "post",
      slug: "tagged",
      title: "Tagged Post",
      content: null,
      status: "published",
      authorId: author.id,
    });
    await h.factory.entry.create({
      type: "post",
      slug: "untagged",
      title: "Untagged Post",
      content: null,
      status: "published",
      authorId: author.id,
    });
    await h.factory.entryTerm.create({ entryId: tagged.id, termId: term.id });
    return h;
  }

  test("GET /<taxonomy>/<term>/feed returns only entries tagged with the term", async () => {
    const h = await seedTermFeed();
    const res = await h.fetch("/category/news/feed");
    res.assertStatus(200);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const body = await res.text();
    expect(body).toContain("Tagged Post");
    expect(body).not.toContain("Untagged Post");
    expect(body).toContain(
      '<atom:link href="https://cms.example/category/news/feed" rel="self"',
    );
  });

  test("GET /<taxonomy>/<term>/feed/atom returns the Atom variant", async () => {
    const h = await seedTermFeed();
    const res = await h.fetch("/category/news/feed/atom");
    res.assertStatus(200);
    expect(res.headers.get("content-type")).toContain("application/atom+xml");
    expect(await res.text()).toContain(
      "<id>https://cms.example/category/news/feed/atom</id>",
    );
  });

  test("a missing term 404s", async () => {
    const h = await seedTermFeed();
    const res = await h.fetch("/category/ghost/feed");
    res.assertStatus(404);
  });

  const blogWithNestedTaxonomyPlugin = definePlugin("blog-nested", (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerTermTaxonomy("region", {
      label: "Regions",
      entryTypes: ["post"],
      isHierarchical: true,
    });
  });

  test("a nested term's feed is served at its nested path", async () => {
    const h = await harness(blogWithNestedTaxonomyPlugin);
    const author = await h.seedUser("admin");
    const europe = await h.factory.term.create({
      taxonomy: "region",
      slug: "europe",
      name: "Europe",
    });
    const france = await h.factory.term.create({
      taxonomy: "region",
      slug: "france",
      name: "France",
      parentId: europe.id,
    });
    const post = await h.factory.entry.create({
      type: "post",
      slug: "paris",
      title: "Paris Post",
      content: null,
      status: "published",
      authorId: author.id,
    });
    await h.factory.entryTerm.create({ entryId: post.id, termId: france.id });

    // The nested URL serves the child term's entries.
    const nested = await h.fetch("/region/europe/france/feed");
    nested.assertStatus(200);
    expect(await nested.text()).toContain("Paris Post");

    // The flat URL for the nested term does not resolve (it isn't a top-level
    // term), so it stays a 404.
    (await h.fetch("/region/france/feed")).assertStatus(404);
  });

  test("a non-taxonomy /<x>/<y>/feed path is nobody's feed", async () => {
    const h = await seedTermFeed();
    // "post" is an entry type, not a taxonomy base slug, so no route claims
    // this — and the router has no page there either.
    const res = await h.fetch("/post/tagged/feed");
    res.assertStatus(404);
  });

  test("the feed:items filter applies to the term-scoped list", async () => {
    const h = await seedTermFeed();
    h.spyFilter("feed:items").override(() => []);
    const body = await (await h.fetch("/category/news/feed")).text();
    expect(body).not.toContain("<item>");
  });
});

describe("author feed routes", () => {
  test("GET /authors/<slug>/feed returns that author's published posts", async () => {
    const h = await harness(blogPlugin);
    const jane = await h.factory.author.create({ name: "Jane", slug: "jane" });
    const john = await h.factory.author.create({ name: "John", slug: "john" });
    await h.factory.entry.create({
      type: "post",
      slug: "by-jane",
      title: "By Jane",
      content: null,
      status: "published",
      authorId: jane.id,
    });
    await h.factory.entry.create({
      type: "post",
      slug: "by-john",
      title: "By John",
      content: null,
      status: "published",
      authorId: john.id,
    });

    const res = await h.fetch("/authors/jane/feed");
    res.assertStatus(200);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const body = await res.text();
    expect(body).toContain(
      '<atom:link href="https://cms.example/authors/jane/feed" rel="self"',
    );
    expect(body).toContain("<title>By Jane</title>");
    expect(body).not.toContain("<title>By John</title>");
  });

  test("GET /authors/<slug>/feed/atom returns an Atom feed", async () => {
    const h = await harness(blogPlugin);
    await h.factory.author.create({ name: "Jane", slug: "jane" });
    const atom = await h.fetch("/authors/jane/feed/atom");
    atom.assertStatus(200);
    expect(await atom.text()).toContain(
      "<id>https://cms.example/authors/jane/feed/atom</id>",
    );
  });

  test("an unknown author slug 404s", async () => {
    const h = await harness(blogPlugin);
    const res = await h.fetch("/authors/nobody/feed");
    res.assertStatus(404);
  });
});

describe("date feed routes", () => {
  async function seedDated(
    h: DispatcherHarness,
    dates: readonly string[],
  ): Promise<void> {
    const author = await h.seedUser("admin");
    for (const iso of dates) {
      await h.factory.entry.create({
        type: "post",
        slug: `post-${iso}`,
        title: `Post ${iso}`,
        content: null,
        status: "published",
        authorId: author.id,
        publishedAt: new Date(`${iso}T12:00:00Z`),
      });
    }
  }

  test("GET /YYYY[/MM[/DD]]/feed returns the period's posts", async () => {
    const h = await harness(blogPlugin);
    await seedDated(h, ["2026-07-21", "2026-07-22", "2026-08-01"]);

    const month = await h.fetch("/2026/07/feed");
    month.assertStatus(200);
    expect(month.headers.get("content-type")).toContain("application/rss+xml");
    const body = await month.text();
    expect(body).toContain(
      '<atom:link href="https://cms.example/2026/07/feed" rel="self"',
    );
    expect(body).toContain("Post 2026-07-21");
    expect(body).toContain("Post 2026-07-22");
    expect(body).not.toContain("Post 2026-08-01");

    const day = await h.fetch("/2026/07/21/feed");
    day.assertStatus(200);
    const dayBody = await day.text();
    expect(dayBody).toContain("Post 2026-07-21");
    expect(dayBody).not.toContain("Post 2026-07-22");
  });

  test("GET /YYYY/feed/atom returns an Atom feed", async () => {
    const h = await harness(blogPlugin);
    await seedDated(h, ["2026-03-03"]);
    const atom = await h.fetch("/2026/feed/atom");
    atom.assertStatus(200);
    expect(await atom.text()).toContain(
      "<id>https://cms.example/2026/feed/atom</id>",
    );
  });

  test("an impossible date 404s", async () => {
    const h = await harness(blogPlugin);
    (await h.fetch("/2026/02/30/feed")).assertStatus(404);
    (await h.fetch("/2026/13/feed")).assertStatus(404);
  });
});

describe("what the plugin does not claim", () => {
  // The pages plugin's shape: a hierarchical type at the URL root, so an entry
  // slugged "feed" lands at `/<parent>/feed`.
  const pagesPlugin = definePlugin("pages-like", (ctx) => {
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      isHierarchical: true,
      rewrite: { slug: "" },
    });
  });

  test("an entry slugged 'feed' under a public entry type still renders as content", async () => {
    const h = await harness(pagesPlugin);
    const author = await h.seedUser("admin");
    const about = await h.factory.entry.create({
      type: "page",
      slug: "about",
      title: "About",
      content: null,
      status: "published",
      authorId: author.id,
    });
    await h.factory.entry.create({
      type: "page",
      slug: "feed",
      title: "Feed Page",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: about.id,
    });

    const res = await h.fetch("/about/feed");
    res.assertStatus(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<h1>Feed Page</h1>");
  });

  test("a nested path under a flat taxonomy is not a term feed", async () => {
    const h = await harness(blogWithTaxonomyPlugin);
    // `category` is flat, so it claims `/category/:path/feed` only — a second
    // segment is nobody's feed.
    (await h.fetch("/category/news/local/feed")).assertStatus(404);
  });
});

describe("non-canonical feed URLs", () => {
  // The 301 normalizer exempts a *registered* path. A trailing-slash variant
  // is not one, so it normalizes onto the feed rather than falling through to
  // the content router's 404 — for every scope, not just the site's.
  test.each([
    ["the site feed", "/feed", "/feed/"],
    ["a type feed", "/post/feed", "/post/feed/"],
    ["an atom feed", "/feed/atom", "/feed/atom/"],
    ["an author feed", "/authors/jane/feed", "/authors/jane/feed/"],
    ["a date feed", "/2026/07/feed", "/2026/07/feed/"],
  ])("%s 301s from its trailing-slash form", async (_name, target, variant) => {
    const h = await harness(blogPlugin);
    const res = await h.fetch(variant);
    res.assertStatus(301);
    expect(res.headers.get("location")).toBe(`https://cms.example${target}`);
  });

  test("a registered feed path is never redirected", async () => {
    const h = await harness(blogPlugin);
    (await h.fetch("/feed")).assertStatus(200);
    (await h.fetch("/post/feed")).assertStatus(200);
  });
});

describe("archive-type feeds", () => {
  // The archive-type `feed` field is this plugin's augmentation, not a core
  // one — a plugin declares it and the routes come from the same enumeration
  // every other scope does.
  const eventsPlugin = definePlugin("events", (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerArchiveType("event-series", {
      routes: ["/events/:series"],
      resolve: (_ctx, params) => ({
        data: { kind: "custom", name: "event-series" },
        title: `Series: ${params.series ?? ""}`,
      }),
      feed: {
        routes: ["/events/:series/feed"],
        filter: (_ctx, params) =>
          params.series === "missing" ? null : eq(entries.status, "published"),
      },
    });
  });

  test("serves the archive's declared feed in both formats", async () => {
    const h = await harness(eventsPlugin);
    await seedPost(h, "hello", "Hello World");

    const rss = await h.fetch("/events/summer/feed");
    rss.assertStatus(200);
    expect(rss.headers.get("content-type")).toContain("application/rss+xml");
    expect(await rss.text()).toContain("<title>Hello World</title>");

    const atom = await h.fetch("/events/summer/feed/atom");
    atom.assertStatus(200);
    expect(await atom.text()).toContain(
      "<id>https://cms.example/events/summer/feed/atom</id>",
    );
  });

  test("a filter returning null 404s", async () => {
    const h = await harness(eventsPlugin);
    (await h.fetch("/events/missing/feed")).assertStatus(404);
  });

  test("a declared route that is not feed-shaped is ignored, not registered over the archive", async () => {
    // A registered public route answers ahead of the content router, so
    // claiming the archive's own path would serve XML where the page was.
    const shadowing = definePlugin("shadowing", (ctx) => {
      ctx.registerArchiveType("event-series", {
        routes: ["/events/:series"],
        resolve: () => ({
          data: { kind: "custom", name: "event-series" },
          title: "Series",
        }),
        feed: {
          routes: ["/events/:series"],
          filter: () => eq(entries.status, "published"),
        },
      });
    });
    const h = await harness(shadowing);
    const res = await h.fetch("/events/summer");
    res.assertStatus(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("an archive feed route colliding with a type feed leaves the type feed serving", async () => {
    // Core answered the first matching branch; two claims on one path would
    // otherwise fail the boot with this plugin named as its own rival.
    const colliding = definePlugin("colliding", (ctx) => {
      ctx.registerEntryType("events", { label: "Events", isPublic: true });
      ctx.registerArchiveType("event-series", {
        routes: ["/series/:name"],
        resolve: () => ({
          data: { kind: "custom", name: "event-series" },
          title: "Series",
        }),
        feed: {
          routes: ["/events/feed"],
          filter: () => eq(entries.status, "published"),
        },
      });
    });
    const h = await harness(colliding);
    (await h.fetch("/events/feed")).assertStatus(200);
  });

  test("a plugin archive advertises no feed of its own", async () => {
    const h = await harness(eventsPlugin);
    const body = await (await h.fetch("/events/summer")).text();
    expect(body).not.toContain('rel="alternate"');
  });
});

describe("the site's own settings", () => {
  test("a private site 404s every feed and advertises none", async () => {
    const h = await harness(blogPlugin);
    await seedPost(h, "hello", "Hello World");
    await h.factory.setting.create({
      group: "site",
      key: "public",
      value: false,
    });

    (await h.fetch("/feed")).assertStatus(404);
    (await h.fetch("/post/feed")).assertStatus(404);
    expect(await (await h.fetch("/")).text()).not.toContain(
      'type="application/rss+xml"',
    );
  });

  test("the feed carries the base prefix in its item links and its self URL", async () => {
    const h = await createDispatcherHarness({
      basePath: "/custom-directory",
      plugins: [blogPlugin, feeds()],
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hello-world",
      title: "Hello World",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const res = await h.fetch("/custom-directory/feed");
    res.assertStatus(200);
    const body = await res.text();
    expect(body).toContain(
      "https://cms.example/custom-directory/post/hello-world",
    );
    expect(body).toContain("https://cms.example/custom-directory/feed");
  });
});

describe("a feed at the edge", () => {
  function cdnStub() {
    const stored = new Map<string, Response>();
    const put = vi.fn<CdnStore["put"]>((request, response) => {
      stored.set(request.url, response);
      return Promise.resolve();
    });
    const match: CdnStore["match"] = (request) =>
      Promise.resolve(stored.get(request.url)?.clone());
    const purgeTags = vi.fn<NonNullable<ConnectedCdn["purgeTags"]>>(() =>
      Promise.resolve(),
    );
    const cdn: ConnectedCdn = {
      decorate: (response) => response,
      store: { match, put },
      purgeTags,
    };
    return { cdn, put, purgeTags };
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

  function seriesArchive(cacheable: boolean): AnyPluginDescriptor {
    return definePlugin("series", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerArchiveType("series", {
        routes: ["/series/:name"],
        cacheable,
        resolve: () => ({
          data: { kind: "custom", name: "series" },
          title: "Series",
        }),
        feed: {
          routes: ["/series/:name/feed"],
          filter: () => eq(entries.status, "published"),
        },
      });
    });
  }

  async function publishPost(h: DispatcherHarness): Promise<void> {
    const published = await h.fetch("/_plumix/rpc/entry/create", {
      as: await h.seedUser("admin"),
      json: {
        json: {
          type: "post",
          title: "Hello",
          slug: "hello",
          status: "published",
        },
        meta: [],
      },
    });
    published.assertStatus(200);
    await h.drainDeferred();
  }

  test("declares a shared freshness window and is stored under the type it lists", async () => {
    const { cdn, put } = cdnStub();
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, feeds()],
      cdn,
    });
    await seedPost(h, "hello", "Hello World");

    const res = await h.fetch("/post/feed");
    await h.drainDeferred();

    res.assertStatus(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=3600",
    );
    expect(tagsFor(put, "/post/feed")).toContain(typeTag("post"));
  });

  test("publishing a post purges every cached feed it can appear in", async () => {
    const { cdn, put, purgeTags } = cdnStub();
    const h = await createDispatcherHarness({
      plugins: [blogWithTaxonomyPlugin, feeds()],
      cdn,
    });
    await h.factory.category.create({ slug: "news", name: "News" });
    const paths = ["/feed", "/post/feed", "/category/news/feed"];
    for (const path of paths) (await h.fetch(path)).assertStatus(200);
    await h.drainDeferred();

    await publishPost(h);

    const purged = new Set(purgeTags.mock.calls.flatMap(([tags]) => [...tags]));
    const retired = Object.fromEntries(
      paths.map((path) => [
        path,
        tagsFor(put, path).some((tag) => purged.has(tag)),
      ]),
    );
    expect(retired).toEqual({
      "/feed": true,
      "/post/feed": true,
      "/category/news/feed": true,
    });
  });

  test("deleting a term in a taxonomy listing no entry types purges its cached feed", async () => {
    const { cdn, put, purgeTags } = cdnStub();
    const site = definePlugin("site", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerTermTaxonomy("topic", { label: "Topics" });
    });
    const h = await createDispatcherHarness({ plugins: [site, feeds()], cdn });
    const admin = await h.seedUser("admin");
    const topic = await h.factory.term.create({
      taxonomy: "topic",
      slug: "news",
      name: "News",
    });
    const post = await h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Hello",
      content: null,
      status: "published",
      authorId: admin.id,
    });
    await h.factory.entryTerm.create({ entryId: post.id, termId: topic.id });
    (await h.fetch("/topic/news/feed")).assertStatus(200);
    await h.drainDeferred();

    const deleted = await h.fetch("/_plumix/rpc/term/delete", {
      as: admin,
      json: { json: { id: topic.id }, meta: [] },
    });
    deleted.assertStatus(200);
    await h.drainDeferred();

    const purged = new Set(purgeTags.mock.calls.flatMap(([tags]) => [...tags]));
    const stored = tagsFor(put, "/topic/news/feed");
    expect(stored).not.toEqual([]);
    expect(stored.some((tag) => purged.has(tag))).toBe(true);
  });

  test("renaming an author purges their cached feed", async () => {
    const { cdn, put, purgeTags } = cdnStub();
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, feeds()],
      cdn,
    });
    const admin = await h.seedUser("admin");
    const jane = await h.factory.author.create({ name: "Jane", slug: "jane" });
    await h.factory.entry.create({
      type: "post",
      slug: "by-jane",
      title: "By Jane",
      content: null,
      status: "published",
      authorId: jane.id,
    });
    (await h.fetch("/authors/jane/feed")).assertStatus(200);
    await h.drainDeferred();

    const renamed = await h.fetch("/_plumix/rpc/user/update", {
      as: admin,
      json: { json: { id: jane.id, name: "Janet" }, meta: [] },
    });
    renamed.assertStatus(200);
    await h.drainDeferred();

    const purged = new Set(purgeTags.mock.calls.flatMap(([tags]) => [...tags]));
    const stored = tagsFor(put, "/authors/jane/feed");
    expect(stored).not.toEqual([]);
    expect(stored.some((tag) => purged.has(tag))).toBe(true);
  });

  // A delete reassigns the author's entries without firing an entry action, so
  // only the user purge can retire the feed that names them.
  test("deleting an author purges their cached feed", async () => {
    const { cdn, put, purgeTags } = cdnStub();
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, feeds()],
      cdn,
    });
    const admin = await h.seedUser("admin");
    const jane = await h.factory.author.create({ name: "Jane", slug: "jane" });
    await h.factory.entry.create({
      type: "post",
      slug: "by-jane",
      title: "By Jane",
      content: null,
      status: "published",
      authorId: jane.id,
    });
    (await h.fetch("/authors/jane/feed")).assertStatus(200);
    await h.drainDeferred();

    const deleted = await h.fetch("/_plumix/rpc/user/delete", {
      as: admin,
      json: { json: { id: jane.id, reassignTo: admin.id }, meta: [] },
    });
    deleted.assertStatus(200);
    await h.drainDeferred();

    const purged = new Set(purgeTags.mock.calls.flatMap(([tags]) => [...tags]));
    const stored = tagsFor(put, "/authors/jane/feed");
    expect(stored).not.toEqual([]);
    expect(stored.some((tag) => purged.has(tag))).toBe(true);
  });

  // Core can't see what a custom archive depends on, so it stays live unless
  // the archive opted in; its feed reads the same things.
  test("a plugin archive that never opted into caching serves its feed live", async () => {
    const { cdn, put } = cdnStub();
    const h = await createDispatcherHarness({
      plugins: [seriesArchive(false), feeds()],
      cdn,
    });

    const res = await h.fetch("/series/summer/feed");
    await h.drainDeferred();

    res.assertStatus(200);
    expect(res.headers.get("cache-control")).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  test("a plugin archive's feed is purged by a publish of any type its filter can read", async () => {
    const { cdn, put, purgeTags } = cdnStub();
    const h = await createDispatcherHarness({
      plugins: [seriesArchive(true), feeds()],
      cdn,
    });
    (await h.fetch("/series/summer/feed")).assertStatus(200);
    await h.drainDeferred();

    await publishPost(h);

    const purged = purgeTags.mock.calls.flatMap(([tags]) => [...tags]);
    expect(purged).toContain(typeTag("post"));
    expect(tagsFor(put, "/series/summer/feed")).toContain(typeTag("post"));
  });

  // The channel's title and description, and whether there is a feed at all,
  // come from the site settings, which no entry purge reaches.
  test("saving the site settings purges every cached feed", async () => {
    const { cdn, put, purgeTags } = cdnStub();
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, feeds()],
      cdn,
    });
    const admin = await h.seedUser("admin");
    (await h.fetch("/post/feed")).assertStatus(200);
    await h.drainDeferred();

    const saved = await h.fetch("/_plumix/rpc/settings/upsert", {
      as: admin,
      json: { json: { group: "site", values: { public: false } }, meta: [] },
    });
    saved.assertStatus(200);
    await h.drainDeferred();

    expect(purgeTags.mock.calls.flatMap(([tags]) => [...tags])).toEqual([
      FEED_TAG,
    ]);
    expect(tagsFor(put, "/post/feed")).toContain(FEED_TAG);
  });

  test("a private site's feed 404s and is never stored", async () => {
    const { cdn, put } = cdnStub();
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, feeds()],
      cdn,
    });
    await seedPost(h, "hello", "Hello World");
    await h.factory.setting.create({
      group: "site",
      key: "public",
      value: false,
    });

    const res = await h.fetch("/feed");
    await h.drainDeferred();

    res.assertStatus(404);
    expect(res.headers.get("cache-control")).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });
});

describe("without the plugin installed", () => {
  test("nothing serves a feed and no page advertises one", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    await seedPost(h, "hello", "Hello World");

    (await h.fetch("/feed")).assertStatus(404);
    (await h.fetch("/post/feed")).assertStatus(404);
    expect(await (await h.fetch("/")).text()).not.toContain(
      'type="application/rss+xml"',
    );
  });
});
