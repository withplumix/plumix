import { describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

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
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
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
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
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
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
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
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
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
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    await seedPost(h, "live", "Live Post", "published");
    await seedPost(h, "wip", "Draft Post", "draft");

    const body = await (await h.fetch("/feed")).text();
    expect(body).toContain("Live Post");
    expect(body).not.toContain("Draft Post");
  });

  test("an unknown entry type 404s", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const res = await h.fetch("/widget/feed");
    res.assertStatus(404);
  });

  test("the seo:feed:items filter can adjust the item list", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    await seedPost(h, "hello", "Hello World");
    h.spyFilter("seo:feed:items").override(() => []);

    const body = await (await h.fetch("/feed")).text();
    expect(body).not.toContain("<item>");
  });

  test("feed discovery <link rel=alternate> tags appear in the head", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    await seedPost(h, "hello", "Hello World");

    const body = await (await h.fetch("/")).text();
    expect(body).toContain(
      '<link rel="alternate" type="application/rss+xml" href="https://cms.example/feed"',
    );
    expect(body).toContain(
      '<link rel="alternate" type="application/atom+xml" href="https://cms.example/feed/atom"',
    );
  });
});

describe("term feed routes", () => {
  async function seedTermFeed(): Promise<
    Awaited<ReturnType<typeof createDispatcherHarness>>
  > {
    const h = await createDispatcherHarness({
      plugins: [blogWithTaxonomyPlugin],
    });
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

  test("a nested term's feed is served at its nested path (regression: no more 404)", async () => {
    const h = await createDispatcherHarness({
      plugins: [blogWithNestedTaxonomyPlugin],
    });
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

  test("a non-taxonomy /<x>/<y>/feed path falls through to public routing", async () => {
    const h = await seedTermFeed();
    // "post" is an entry type, not a taxonomy base slug → not a term feed.
    const res = await h.fetch("/post/tagged/feed");
    res.assertStatus(404);
  });

  test("the seo:feed:items filter applies to the term-scoped list", async () => {
    const h = await seedTermFeed();
    h.spyFilter("seo:feed:items").override(() => []);
    const body = await (await h.fetch("/category/news/feed")).text();
    expect(body).not.toContain("<item>");
  });

  test("term-archive pages emit the matching feed-discovery tags", async () => {
    const h = await seedTermFeed();
    const body = await (await h.fetch("/category/news")).text();
    expect(body).toContain(
      '<link rel="alternate" type="application/rss+xml" href="https://cms.example/category/news/feed"',
    );
    expect(body).toContain(
      '<link rel="alternate" type="application/atom+xml" href="https://cms.example/category/news/feed/atom"',
    );
  });
});

describe("author feed routes", () => {
  test("GET /authors/<slug>/feed returns that author's published posts", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
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
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    await h.factory.author.create({ name: "Jane", slug: "jane" });
    const atom = await h.fetch("/authors/jane/feed/atom");
    atom.assertStatus(200);
    expect(await atom.text()).toContain(
      "<id>https://cms.example/authors/jane/feed/atom</id>",
    );
  });

  test("an unknown author slug 404s", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const res = await h.fetch("/authors/nobody/feed");
    res.assertStatus(404);
  });

  test("only published entries appear in the author feed", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const jane = await h.factory.author.create({ name: "Jane", slug: "jane" });
    await h.factory.entry.create({
      type: "post",
      slug: "live",
      title: "Live One",
      content: null,
      status: "published",
      authorId: jane.id,
    });
    await h.factory.entry.create({
      type: "post",
      slug: "wip",
      title: "Draft One",
      content: null,
      status: "draft",
      authorId: jane.id,
    });
    const body = await (await h.fetch("/authors/jane/feed")).text();
    expect(body).toContain("Live One");
    expect(body).not.toContain("Draft One");
  });

  test("author-archive pages emit the matching feed-discovery tags", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    await h.factory.author.create({ name: "Jane", slug: "jane" });
    const body = await (await h.fetch("/authors/jane")).text();
    expect(body).toContain(
      '<link rel="alternate" type="application/rss+xml" href="https://cms.example/authors/jane/feed"',
    );
    expect(body).toContain(
      '<link rel="alternate" type="application/atom+xml" href="https://cms.example/authors/jane/feed/atom"',
    );
  });
});

describe("date feed routes", () => {
  async function seedDated(
    h: Awaited<ReturnType<typeof createDispatcherHarness>>,
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
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
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
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    await seedDated(h, ["2026-03-03"]);
    const atom = await h.fetch("/2026/feed/atom");
    atom.assertStatus(200);
    expect(await atom.text()).toContain(
      "<id>https://cms.example/2026/feed/atom</id>",
    );
  });

  test("an impossible date 404s", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    (await h.fetch("/2026/02/30/feed")).assertStatus(404);
    (await h.fetch("/2026/13/feed")).assertStatus(404);
  });

  test("date-archive pages emit the matching feed-discovery tags", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    await seedDated(h, ["2026-07-21"]);
    const body = await (await h.fetch("/2026/07")).text();
    expect(body).toContain(
      '<link rel="alternate" type="application/rss+xml" href="https://cms.example/2026/07/feed"',
    );
    expect(body).toContain(
      '<link rel="alternate" type="application/atom+xml" href="https://cms.example/2026/07/feed/atom"',
    );
  });
});
