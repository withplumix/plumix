import type {
  AnyPluginDescriptor,
  CdnStore,
  ConnectedCdn,
  JsonValue,
} from "plumix";
import type { EntryQuery } from "plumix/db";
import type { DispatcherHarness } from "plumix/test";
import {
  authenticatedPolicy,
  challenge,
  definePolicy,
  grant,
} from "plumix/auth";
import { entryQuery, sql, typeTag } from "plumix/db";
import { definePlugin, FRAMEWORK_PAGINATION_SUFFIX } from "plumix/plugin";
import { entries } from "plumix/schema";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test, vi } from "vitest";

import { feeds } from "./index.js";
import { FEED_LIMIT } from "./items.js";
import { FEED_TAG } from "./respond.js";

// Every suite below installs the plugin over the host plugin it syndicates:
// the plugin claims its routes in `afterSetup`, so what it serves is decided
// by what the site registered, not by what the request path looks like.
function harness(
  ...plugins: readonly AnyPluginDescriptor[]
): Promise<DispatcherHarness> {
  return createDispatcherHarness({ plugins: [...plugins, feeds()] });
}

// `plumix` exports no span type; this is the part of one these tests read.
interface SpanTree {
  readonly name: string;
  readonly attributes: Readonly<Record<string, JsonValue>>;
  readonly children: readonly SpanTree[];
}

function flattenSpans(spans: readonly SpanTree[]): SpanTree[] {
  return spans.flatMap((span) => [span, ...flattenSpans(span.children)]);
}

// The SQL each database span ran, in the order it ran.
function sqlOf(spans: readonly SpanTree[]): string[] {
  return flattenSpans(spans).flatMap((span) => {
    const sql = span.attributes["db.sql"];
    return typeof sql === "string" ? [sql] : [];
  });
}

function countDbSpans(spans: readonly SpanTree[]): number {
  return flattenSpans(spans).filter((span) => span.name.startsWith("db: "))
    .length;
}

// A members-only gate that answers terminally. The challenge is hard, not
// soft: a soft one still renders, so it would gate nothing. And
// `authenticatedPolicy` would redirect to a sign-in page this harness does
// not route, which is not what the test is about either.
const membersOnlyPolicy = definePolicy({
  segments: ["members"],
  resolve: (ctx) => (ctx.user ? grant("members") : challenge("subscribe")),
});

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

  test("an access-policied entry type stays out of every feed", async () => {
    // The entry's own page is gated, so nothing about it may ride out on a
    // feed either: a feed is fetched by a reader carrying no session and
    // served from a shared cache, so there is no principal to gate it for.
    // The policy answers terminally rather than redirecting to sign-in —
    // this harness routes no sign-in page, and where the gate sends the
    // reader is not what is under test.
    const membersOnly = definePlugin("members", (ctx) => {
      ctx.registerEntryType("post", {
        label: "Posts",
        isPublic: true,
        hasArchive: true,
      });
      ctx.registerEntryType("lesson", {
        label: "Lessons",
        isPublic: true,
        hasArchive: true,
        access: { default: membersOnlyPolicy },
      });
    });
    const h = await harness(membersOnly);
    const author = await h.seedUser("admin");
    await seedPost(h, "live", "Open Post");
    await h.factory.entry.create({
      type: "lesson",
      slug: "secret",
      title: "Members Only Lesson",
      content: null,
      status: "published",
      authorId: author.id,
    });

    // The site feed carries every public type, so it is where a gated one
    // leaks without any scope naming it.
    const site = await (await h.fetch("/feed")).text();
    expect(site).toContain("Open Post");
    expect(site).not.toContain("Members Only Lesson");

    // And the type has no feed of its own to be asked for. Whatever the gate
    // answers at that URL once the feed route is gone, it is not a feed.
    const typeFeed = await h.fetch("/lesson/feed");
    expect(typeFeed.headers.get("content-type")).not.toContain("xml");
  });

  test("a type's feed sits beside its archive page, and a type with no archive page has none", async () => {
    const news = definePlugin("news", (ctx) => {
      ctx.registerEntryType("article", {
        label: "Articles",
        isPublic: true,
        hasArchive: "news",
      });
      ctx.registerEntryType("note", {
        label: "Notes",
        isPublic: true,
        hasArchive: false,
      });
    });
    const h = await harness(news);
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "article",
      slug: "launch",
      title: "Launch Article",
      content: null,
      status: "published",
      authorId: author.id,
    });

    const feed = await h.fetch("/news/feed");
    feed.assertStatus(200);
    expect(await feed.text()).toContain("<title>Launch Article</title>");
    (await h.fetch("/news/feed/atom")).assertStatus(200);
    (await h.fetch("/article/feed")).assertStatus(404);
    (await h.fetch("/note/feed")).assertStatus(404);
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
        hasArchive: true,
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

// A feed is its archive's own entry query (ADR 0008). Each archive below
// narrows, and each seed is one some archive's query leaves out: another
// author, another year, an untagged entry, a hierarchical page, a non-public
// type, an entry with no publish date.
describe("a feed is its archive's entry query", () => {
  const site = definePlugin("site", (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      isHierarchical: true,
      hasArchive: "all-pages",
    });
    ctx.registerEntryType("secret", { label: "Secrets", isPublic: false });
    ctx.registerTermTaxonomy("topic", {
      label: "Topics",
      entryTypes: ["post", "secret"],
    });
    ctx.registerTermTaxonomy("tag", { label: "Tags" });
    ctx.registerArchiveType("series", {
      routes: ["/series/:name"],
      title: "Series",
      entries: (q, params) =>
        q.ofTypes("post", "page").inTerm("tag", params.name ?? ""),
      feed: true,
    });
  });

  const SLUGS = [
    "old-post",
    "new-post",
    "other-post",
    "a-page",
    "a-secret",
    "undated-post",
  ];

  async function seedSite(): Promise<DispatcherHarness> {
    const h = await harness(site);
    const jane = await h.factory.author.create({ name: "Jane", slug: "jane" });
    const john = await h.factory.author.create({ name: "John", slug: "john" });
    const seed = (
      type: string,
      slug: string,
      authorId: number,
      publishedAt: Date | null,
    ) =>
      h.factory.entry.create({
        type,
        slug,
        title: `Title ${slug}`,
        content: null,
        status: "published",
        authorId,
        publishedAt,
      });
    const tagged = [
      await seed("post", "old-post", jane.id, new Date("2026-04-01T12:00:00Z")),
      await seed("post", "new-post", jane.id, new Date("2026-04-20T12:00:00Z")),
      await seed("page", "a-page", jane.id, new Date("2026-04-10T12:00:00Z")),
      await seed(
        "secret",
        "a-secret",
        jane.id,
        new Date("2026-04-11T12:00:00Z"),
      ),
      await seed("post", "undated-post", jane.id, null),
    ];
    await seed("post", "other-post", john.id, new Date("2025-01-01T12:00:00Z"));
    const topic = await h.factory.term.create({ taxonomy: "topic", slug: "t" });
    const tag = await h.factory.term.create({ taxonomy: "tag", slug: "g" });
    for (const entry of tagged) {
      await h.factory.entryTerm.create({ entryId: entry.id, termId: topic.id });
      await h.factory.entryTerm.create({ entryId: entry.id, termId: tag.id });
    }
    return h;
  }

  // The seeded entries a page lists, in seed order.
  async function listedOn(h: DispatcherHarness, path: string) {
    const res = await h.fetch(path);
    res.assertStatus(200);
    const body = await res.text();
    return SLUGS.filter((slug) => body.includes(`Title ${slug}`));
  }

  // The seeded entries a feed carries, in the feed's own order.
  async function syndicatedOn(h: DispatcherHarness, path: string) {
    const res = await h.fetch(path);
    res.assertStatus(200);
    const body = await res.text();
    return [...body.matchAll(/<title>Title ([^<]+)<\/title>/g)].map(
      ([, slug]) => slug,
    );
  }

  test.each([
    ["the front page", "/", "/feed", ["new-post", "old-post", "other-post"]],
    [
      "a type archive",
      "/post",
      "/post/feed",
      ["new-post", "old-post", "other-post"],
    ],
    [
      "a hierarchical type's archive",
      "/all-pages",
      "/all-pages/feed",
      ["a-page"],
    ],
    [
      "a term of a taxonomy naming its types",
      "/topic/t",
      "/topic/t/feed",
      ["new-post", "old-post"],
    ],
    [
      "a term of a taxonomy naming none",
      "/tag/g",
      "/tag/g/feed",
      ["new-post", "a-page", "old-post"],
    ],
    [
      "an author archive",
      "/authors/jane",
      "/authors/jane/feed",
      ["new-post", "old-post"],
    ],
    ["a date archive", "/2026", "/2026/feed", ["new-post", "old-post"]],
    [
      "a plugin archive",
      "/series/g",
      "/series/g/feed",
      ["new-post", "a-page", "old-post"],
    ],
  ])(
    "%s and its feed contain the same entries, the feed newest first",
    async (_archive, page, feed, newestFirst) => {
      const h = await seedSite();
      expect(await syndicatedOn(h, feed)).toEqual(newestFirst);
      expect(await listedOn(h, page)).toEqual(
        SLUGS.filter((slug) => newestFirst.includes(slug)),
      );
    },
  );

  test.each(["/feed", "/authors/jane/feed", "/2026/feed"])(
    "%s leaves hierarchical entries out, as its page does",
    async (feed) => {
      const h = await seedSite();
      expect(await syndicatedOn(h, feed)).not.toContain("a-page");
    },
  );

  test("an archive ordering its page by title still feeds newest first", async () => {
    const alphabetical = definePlugin("alphabetical", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerArchiveType("a-to-z", {
        routes: ["/a-to-z"],
        title: "A to Z",
        entries: (q) => q.ofTypes("post").orderBy("title", "asc"),
        feed: true,
      });
    });
    const h = await harness(alphabetical);
    const author = await h.seedUser("admin");
    for (const [slug, publishedAt] of [
      ["alpha", "2026-01-01T12:00:00Z"],
      ["bravo", "2026-03-01T12:00:00Z"],
      ["charlie", "2026-02-01T12:00:00Z"],
    ] as const) {
      await h.factory.entry.create({
        type: "post",
        slug,
        title: `Title ${slug}`,
        content: null,
        status: "published",
        authorId: author.id,
        publishedAt: new Date(publishedAt),
      });
    }

    const page = await (await h.fetch("/a-to-z")).text();
    const at = ["alpha", "bravo", "charlie"].map((slug) =>
      page.indexOf(`Title ${slug}`),
    );
    expect(at.every((index) => index >= 0)).toBe(true);
    const onPage = ["alpha", "bravo", "charlie"].sort(
      (a, b) => page.indexOf(`Title ${a}`) - page.indexOf(`Title ${b}`),
    );
    expect(onPage).toEqual(["alpha", "bravo", "charlie"]);
    expect(await syndicatedOn(h, "/a-to-z/feed")).toEqual([
      "bravo",
      "charlie",
      "alpha",
    ]);
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
  // one — a plugin declares it and the feed hangs off the archive's own routes.
  const eventsPlugin = definePlugin("events", (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerArchiveType("event-series", {
      routes: [
        "/events/:series",
        `/events/:series${FRAMEWORK_PAGINATION_SUFFIX}`,
      ],
      resolve: (_ctx, params) => ({
        data: { kind: "custom", name: "event-series" },
        title: `Series: ${params.series ?? ""}`,
      }),
      // Nothing is narrowed beyond the public entries the query arrives
      // holding: the visibility rule is the framework's, not this archive's.
      entries: (q, params) => (params.series === "missing" ? null : q),
      perPage: 1,
      feed: true,
    });
  });

  test("a scope that narrows nothing still yields only published, public-type entries", async () => {
    const lax = definePlugin("lax", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerEntryType("secret", { label: "Secret", isPublic: false });
      ctx.registerArchiveType("event-series", {
        routes: ["/events/:series"],
        resolve: () => ({
          data: { kind: "custom", name: "event-series" },
          title: "Events",
        }),
        // The whole point: an archive that declares no narrowing at all cannot
        // widen what the feed shows.
        entries: (q) => q,
        feed: true,
      });
    });
    const h = await harness(lax);
    const author = await h.seedUser("admin");
    for (const [type, slug, title, status] of [
      ["post", "live", "Live Post", "published"],
      ["post", "wip", "Draft Post", "draft"],
      ["post", "gone", "Trashed Post", "trash"],
      ["secret", "hush", "Private Type", "published"],
    ] as const) {
      await h.factory.entry.create({
        type,
        slug,
        title,
        content: null,
        status,
        authorId: author.id,
      });
    }

    const res = await h.fetch("/events/summer/feed");
    res.assertStatus(200);
    const body = await res.text();
    expect(body).toContain("Live Post");
    expect(body).not.toContain("Draft Post");
    expect(body).not.toContain("Trashed Post");
    expect(body).not.toContain("Private Type");
  });

  test("a non-public type cannot crowd a public entry out of the feed window", async () => {
    // The permalink step already drops a row of a type with no public route,
    // so leaving one out of the rendered feed proves nothing about the guard.
    // What the guard's type half keeps is the window: without it, enough
    // newer rows of a non-public type fill every slot and are then dropped,
    // and the public entry the feed owed its reader never appears.
    const crowded = definePlugin("crowded", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerEntryType("note", { label: "Notes", isPublic: false });
      ctx.registerArchiveType("event-series", {
        routes: ["/events/:series"],
        resolve: () => ({
          data: { kind: "custom", name: "event-series" },
          title: "Events",
        }),
        entries: (q) => q,
        feed: true,
      });
    });
    const h = await harness(crowded);
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "older-public",
      title: "Older Public Post",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2020-01-01T00:00:00Z"),
    });
    for (let i = 0; i <= FEED_LIMIT; i++) {
      await h.factory.entry.create({
        type: "note",
        slug: `note-${String(i)}`,
        title: "Note",
        content: null,
        status: "published",
        authorId: author.id,
        publishedAt: new Date("2024-01-01T00:00:00Z"),
      });
    }

    const res = await h.fetch("/events/summer/feed");
    res.assertStatus(200);
    expect(await res.text()).toContain("Older Public Post");
  });

  test("a scope that discards the query it was handed is still guarded", async () => {
    // The seeded query is one half of the guard; this is the other. A scope
    // building its own query from scratch has dropped what it was given, and
    // the feed still owes a reader nothing but published, public-type entries.
    const rebuilds = definePlugin("rebuilds", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerArchiveType("event-series", {
        routes: ["/events/:series"],
        resolve: () => ({
          data: { kind: "custom", name: "event-series" },
          title: "Events",
        }),
        entries: () => entryQuery(),
        feed: true,
      });
    });
    const h = await harness(rebuilds);
    await seedPost(h, "live", "Live Post");
    await seedPost(h, "wip", "Draft Post", "draft");

    const res = await h.fetch("/events/summer/feed");
    res.assertStatus(200);
    const body = await res.text();
    expect(body).toContain("Live Post");
    expect(body).not.toContain("Draft Post");
  });

  test("a scope reaching for raw SQL still cannot widen the feed", async () => {
    // `where` is the escape hatch, and an escape hatch that can widen would put
    // the whole guarantee back where it started. A top-level `OR` is the shape
    // that does it, because it binds looser than the `AND`s around it.
    const sneaky = definePlugin("sneaky", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerArchiveType("event-series", {
        routes: ["/events/:series"],
        resolve: () => ({
          data: { kind: "custom", name: "event-series" },
          title: "Events",
        }),
        entries: (q) =>
          q.where(sql`${entries.slug} = 'live' OR ${entries.slug} = 'wip'`),
        feed: true,
      });
    });
    const h = await harness(sneaky);
    await seedPost(h, "live", "Live Post");
    await seedPost(h, "wip", "Draft Post", "draft");

    const res = await h.fetch("/events/summer/feed");
    res.assertStatus(200);
    const body = await res.text();
    expect(body).toContain("Live Post");
    expect(body).not.toContain("Draft Post");
  });

  test("an archive behind an access policy has no feed at all", async () => {
    // A feed is a registered public route, which core answers ahead of the
    // access gate and the principal loader, so there is no reader to check it
    // against. Until a public route can carry a policy (#2520), a policied
    // archive gets no feed rather than an ungated one.
    const gated = definePlugin("gated", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerArchiveType("event-series", {
        routes: ["/events/:series"],
        access: authenticatedPolicy,
        resolve: () => ({
          data: { kind: "custom", name: "event-series" },
          title: "Events",
        }),
        entries: (q) => q,
        feed: true,
      });
    });
    const h = await harness(gated);
    await seedPost(h, "live", "Live Post");

    (await h.fetch("/events/summer/feed")).assertStatus(404);
    (await h.fetch("/events/summer/feed/atom")).assertStatus(404);
    // Nor does the page name one to the reader who does get through the gate:
    // the head would be pointing at a 404.
    expect(
      await advertised(h, "/events/summer", await h.seedUser("admin")),
    ).toEqual([]);
  });

  test("deciding whether a page advertises its feed resolves nothing", async () => {
    // An archive's query records intent instead of resolving it, which is what
    // lets every page ask "would the feed answer for these params?" without
    // paying for a lookup. The page's own listing looks its term up; asking
    // about the feed must not add a second read of the `terms` table.
    let statements: readonly string[] = [];
    const plugin = definePlugin("term-scoped", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerTermTaxonomy("category", {
        label: "Categories",
        entryTypes: ["post"],
      });
      ctx.registerArchiveType("event-series", {
        routes: ["/events/:series"],
        resolve: () => ({
          data: { kind: "custom", name: "event-series" },
          title: "Events",
        }),
        entries: (q, params) => q.inTerm("category", params.series ?? ""),
        feed: true,
      });
    });
    const readsTerms = (sql: string): boolean => /\bfrom "terms"/i.test(sql);
    async function termReadsRendering(
      plugins: readonly AnyPluginDescriptor[],
    ): Promise<{ readonly reads: number; readonly body: string }> {
      const h = await createDispatcherHarness({
        plugins,
        telemetry: {
          consumers: [
            {
              id: "sql",
              onRequestEnd: (snapshot) => {
                statements = sqlOf(snapshot.spans);
              },
            },
          ],
        },
      });
      await h.factory.category.create({ slug: "summer" });
      const page = await h.fetch("/events/summer");
      page.assertStatus(200);
      return {
        reads: statements.filter(readsTerms).length,
        body: await page.text(),
      };
    }

    const without = await termReadsRendering([plugin]);
    const advertising = await termReadsRendering([plugin, feeds()]);
    expect(advertising.body).toContain("/events/summer/feed");
    expect(without.reads).toBeGreaterThan(0);
    expect(advertising.reads).toBe(without.reads);
  });

  test("a feed whose scope selects nothing is empty rather than missing", async () => {
    const empty = definePlugin("empty", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerArchiveType("event-series", {
        routes: ["/events/:series"],
        resolve: () => ({
          data: { kind: "custom", name: "event-series" },
          title: "Events",
        }),
        entries: (q) => q.none(),
        feed: true,
      });
    });
    const h = await harness(empty);
    await seedPost(h, "live", "Live Post");

    for (const path of ["/events/summer/feed", "/events/summer/feed/atom"]) {
      const res = await h.fetch(path);
      res.assertStatus(200);
      expect(await res.text()).not.toContain("Live Post");
    }
  });

  test("serves a feed under each archive route in both formats", async () => {
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

  // `plumix/test` exports no user type; this is what `seedUser` hands back.
  type SeededUser = Awaited<ReturnType<DispatcherHarness["seedUser"]>>;

  // The `<link rel="alternate">` feed hrefs a rendered page advertises. `as`
  // is for a page behind an access policy, which an anonymous reader is
  // redirected away from before any head is rendered.
  async function advertised(
    h: DispatcherHarness,
    path: string,
    as?: SeededUser,
  ) {
    const res = await h.fetch(path, as === undefined ? undefined : { as });
    res.assertStatus(200);
    const body = await res.text();
    return [...body.matchAll(/<link[^>]*rel="alternate"[^>]*>/g)].map(
      ([tag]) => /href="([^"]*)"/.exec(tag)?.[1],
    );
  }

  test("an archive page advertises its feed in both formats", async () => {
    const h = await harness(eventsPlugin);
    expect(await advertised(h, "/events/summer")).toEqual([
      "https://cms.example/events/summer/feed",
      "https://cms.example/events/summer/feed/atom",
    ]);
  });

  test("a later page advertises the feed of the route it paginates", async () => {
    const h = await harness(eventsPlugin);
    await seedPost(h, "first", "First");
    await seedPost(h, "second", "Second");
    expect(await advertised(h, "/events/summer/page/2")).toEqual([
      "https://cms.example/events/summer/feed",
      "https://cms.example/events/summer/feed/atom",
    ]);
  });

  test("the advertised feed carries the base prefix", async () => {
    const h = await createDispatcherHarness({
      basePath: "/custom-directory",
      plugins: [eventsPlugin, feeds()],
    });
    expect(await advertised(h, "/custom-directory/events/summer")).toEqual([
      "https://cms.example/custom-directory/events/summer/feed",
      "https://cms.example/custom-directory/events/summer/feed/atom",
    ]);
  });

  test("a private site advertises no archive feed", async () => {
    const h = await harness(eventsPlugin);
    await h.factory.setting.create({
      group: "site",
      key: "public",
      value: false,
    });
    expect(await advertised(h, "/events/summer")).toEqual([]);
  });

  test("an alternate another plugin declared first wins over the archive feed", async () => {
    const declaring = definePlugin("declaring", (ctx) => {
      ctx.addFilter("render:document", (manifest) => ({
        ...manifest,
        link: [
          ...(manifest.link ?? []),
          {
            rel: "alternate",
            type: "application/rss+xml",
            href: "https://cms.example/elsewhere",
          },
        ],
      }));
    });
    const h = await harness(eventsPlugin, declaring);
    expect(await advertised(h, "/events/summer")).toEqual([
      "https://cms.example/elsewhere",
      "https://cms.example/events/summer/feed/atom",
    ]);
  });

  test("a paginated archive route has no feed of its own", async () => {
    const h = await harness(eventsPlugin);
    (await h.fetch("/events/summer/page/2/feed")).assertStatus(404);
  });

  test("params the archive's entries decline 404 the page and its feed together", async () => {
    const h = await harness(eventsPlugin);
    (await h.fetch("/events/missing")).assertStatus(404);
    (await h.fetch("/events/missing/feed")).assertStatus(404);
    (await h.fetch("/events/missing/feed/atom")).assertStatus(404);
  });

  test("a type with no archive page leaves its name to a plugin archive's feed", async () => {
    // The type feed used to sit at `/<type name>/feed` whether or not the type
    // had a page there, and took this path from the archive that does.
    const colliding = definePlugin("colliding", (ctx) => {
      ctx.registerEntryType("events", { label: "Events", isPublic: true });
      ctx.registerArchiveType("event-calendar", {
        routes: ["/events"],
        resolve: () => ({
          data: { kind: "custom", name: "event-calendar" },
          title: "Calendar",
        }),
        entries: (q) => q,
        feed: true,
      });
    });
    const h = await harness(colliding);
    (await h.fetch("/events/feed")).assertStatus(200);
    expect(await advertised(h, "/events")).toEqual([
      "https://cms.example/events/feed",
      "https://cms.example/events/feed/atom",
    ]);
  });

  test("an archive route capturing several segments has no feed on its later pages", async () => {
    const docs = definePlugin("docs", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerArchiveType("doc-section", {
        routes: ["/docs/:path+", `/docs/:path+${FRAMEWORK_PAGINATION_SUFFIX}`],
        resolve: () => ({
          data: { kind: "custom", name: "doc-section" },
          title: "Docs",
        }),
        entries: (q) => q,
        perPage: 1,
        feed: true,
      });
    });
    const h = await harness(docs);
    await seedPost(h, "first", "First");
    await seedPost(h, "second", "Second");
    (await h.fetch("/docs/guides/feed")).assertStatus(200);
    (await h.fetch("/docs/guides/page/2/feed")).assertStatus(404);
    (await h.fetch("/docs/guides/page/2/feed/atom")).assertStatus(404);
    expect(await advertised(h, "/docs/guides/page/2")).toEqual([
      "https://cms.example/docs/guides/feed",
      "https://cms.example/docs/guides/feed/atom",
    ]);
  });

  test("the same holds where core derived the later-page route", async () => {
    // An archive that declares `entries` does not register its `/page/:page`
    // form — core derives it — so reading the later pages off `routes` finds
    // none, and every page of the archive would answer as a feed of its own.
    const docs = definePlugin("docs", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerArchiveType("doc-section", {
        routes: ["/docs/:path+"],
        entries: (q) => q.ofTypes("post"),
        title: "Docs",
        feed: true,
      });
    });
    const h = await harness(docs);
    (await h.fetch("/docs/guides/feed")).assertStatus(200);
    (await h.fetch("/docs/guides/page/2/feed")).assertStatus(404);
  });

  test("a feed URL whose route belongs to another archive than the page there is nobody's feed", async () => {
    // `/:section` outranks the `news` type's `/news`, so the page at `/news` is
    // the section's. Core's dispatcher answers `/news/feed` with the literal
    // route, which is the type's, so neither archive's feed can be served
    // there without one archive's entries going out under the other's
    // handler — and the page advertises nothing rather than a 404.
    const sections = definePlugin("sections", (ctx) => {
      ctx.registerEntryType("news", {
        label: "News",
        isPublic: true,
        hasArchive: true,
      });
      ctx.registerArchiveType("section", {
        routes: ["/:section"],
        title: "Section",
        entries: (q) => q,
        feed: true,
      });
    });
    const h = await harness(sections);
    (await h.fetch("/news/feed")).assertStatus(404);
    expect(await advertised(h, "/news")).toEqual([]);
    (await h.fetch("/about/feed")).assertStatus(200);
    expect(await advertised(h, "/about")).toEqual([
      "https://cms.example/about/feed",
      "https://cms.example/about/feed/atom",
    ]);
  });

  test("an archive whose own routes both answer its feed URL still advertises it", async () => {
    const docs = definePlugin("docs", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerArchiveType("doc-section", {
        routes: ["/docs/:slug", "/docs/:path+"],
        resolve: () => ({
          data: { kind: "custom", name: "doc-section" },
          title: "Docs",
        }),
        entries: (q) => q,
        feed: true,
      });
    });
    const h = await harness(docs);
    expect(await advertised(h, "/docs/guides")).toEqual([
      "https://cms.example/docs/guides/feed",
      "https://cms.example/docs/guides/feed/atom",
    ]);
  });

  test("an archive on a site with no public entry type has no feed", async () => {
    // Every built-in scope already 404s a site that routes no public type;
    // an archive's feed is not the one surface that gets to differ.
    const nothingPublic = definePlugin("private-only", (ctx) => {
      ctx.registerEntryType("note", { label: "Notes", isPublic: false });
      ctx.registerArchiveType("event-series", {
        routes: ["/events/:series"],
        resolve: () => ({
          data: { kind: "custom", name: "event-series" },
          title: "Events",
        }),
        entries: (q) => q,
        feed: true,
      });
    });
    const h = await harness(nothingPublic);
    (await h.fetch("/events/summer/feed")).assertStatus(404);
    (await h.fetch("/events/summer/feed/atom")).assertStatus(404);
    // Nor does the archive page name one: the head would point at a 404.
    expect(await advertised(h, "/events/summer")).toEqual([]);
  });

  test("a plugin archive without a feed advertises none", async () => {
    const feedless = definePlugin("feedless", (ctx) => {
      ctx.registerArchiveType("event-series", {
        routes: ["/events/:series"],
        resolve: () => ({
          data: { kind: "custom", name: "event-series" },
          title: "Series",
        }),
      });
    });
    const h = await harness(feedless);
    expect(await advertised(h, "/events/summer")).toEqual([]);
  });
});

describe("the feed option", () => {
  test("takes an empty object in place of true, and nothing but an archive with entries", async () => {
    const reserved = definePlugin("reserved", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerArchiveType("everything", {
        routes: ["/everything"],
        title: "Everything",
        entries: (q) => q,
        feed: {},
      });
    });
    const h = await harness(reserved);
    await seedPost(h, "hello", "Hello World");
    expect(await (await h.fetch("/everything/feed")).text()).toContain(
      "<title>Hello World</title>",
    );

    // Never installed: what is under test is what compiles.
    definePlugin("refused", (ctx) => {
      // @ts-expect-error — no `entries`, so nothing a feed could read.
      ctx.registerArchiveType("unlisted", {
        routes: ["/unlisted"],
        resolve: () => ({
          data: { kind: "custom", name: "unlisted" },
          title: "Unlisted",
        }),
        feed: true,
      });
      ctx.registerArchiveType("scoped", {
        routes: ["/scoped"],
        title: "Scoped",
        entries: (q) => q,
        // @ts-expect-error — `scope` is gone: a feed is the archive's `entries`.
        feed: { scope: (q: EntryQuery) => q },
      });
    });
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
        entries: (q) => q,
        feed: true,
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

  test("a plugin archive's feed is purged by a publish of any type its scope can read", async () => {
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
