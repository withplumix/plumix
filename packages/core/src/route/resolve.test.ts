import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { buildEntryPermalink, buildTermArchiveUrl } from "./permalink.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

const shopPlugin = definePlugin("shop", (ctx) => {
  ctx.registerEntryType("product", {
    label: "Products",
    isPublic: true,
    hasArchive: true,
    rewrite: { slug: "shop" },
  });
});

const TIPTAP_BODY = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }],
};

const hierarchicalPagesPlugin = definePlugin("pages", (ctx) => {
  ctx.registerEntryType("page", {
    label: "Pages",
    isPublic: true,
    isHierarchical: true,
  });
});

describe("resolvePublicRoute — hierarchical single", () => {
  test("top-level /<base>/leaf resolves the entry with no parent", async () => {
    const h = await createDispatcherHarness({
      plugins: [hierarchicalPagesPlugin],
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "page",
      slug: "about",
      title: "About",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: null,
    });
    const response = await h.dispatch(
      new Request("https://cms.example/page/about"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<h1>About</h1>");
  });

  test("nested /<base>/parent/leaf resolves the entry by walking the chain", async () => {
    const h = await createDispatcherHarness({
      plugins: [hierarchicalPagesPlugin],
    });
    const author = await h.seedUser("admin");
    const about = await h.factory.entry.create({
      type: "page",
      slug: "about",
      title: "About",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: null,
    });
    const team = await h.factory.entry.create({
      type: "page",
      slug: "team",
      title: "Team",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: about.id,
    });
    await h.factory.entry.create({
      type: "page",
      slug: "leadership",
      title: "Leadership",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: team.id,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/page/about/team/leadership"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<h1>Leadership</h1>");
  });

  test("URL with mismatched ancestor returns 404", async () => {
    const h = await createDispatcherHarness({
      plugins: [hierarchicalPagesPlugin],
    });
    const author = await h.seedUser("admin");
    const about = await h.factory.entry.create({
      type: "page",
      slug: "about",
      title: "About",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: null,
    });
    await h.factory.entry.create({
      type: "page",
      slug: "team",
      title: "Team",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: about.id,
    });
    // "team" exists under "about", not under "wrong" — chain mismatch.
    const response = await h.dispatch(
      new Request("https://cms.example/page/wrong/team"),
    );
    expect(response.status).toBe(404);
  });

  test("buildEntryPermalink round-trips through the route map (closes permalink.ts:21-26 gap)", async () => {
    const h = await createDispatcherHarness({
      plugins: [hierarchicalPagesPlugin],
    });
    const author = await h.seedUser("admin");
    const about = await h.factory.entry.create({
      type: "page",
      slug: "about",
      title: "About",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: null,
    });
    const team = await h.factory.entry.create({
      type: "page",
      slug: "team",
      title: "Team",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: about.id,
    });
    const leadership = await h.factory.entry.create({
      type: "page",
      slug: "leadership",
      title: "Leadership",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: team.id,
    });

    const ctx = { db: h.db, plugins: h.app.plugins } as unknown as AppContext;
    const url = await buildEntryPermalink(ctx, {
      type: "page",
      slug: leadership.slug,
      parentId: leadership.parentId,
    });
    expect(url).toBe("/page/about/team/leadership");

    const response = await h.dispatch(new Request(`https://cms.example${url}`));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<h1>Leadership</h1>");
  });

  test("top-level URL with extra ancestor segments returns 404", async () => {
    const h = await createDispatcherHarness({
      plugins: [hierarchicalPagesPlugin],
    });
    const author = await h.seedUser("admin");
    // "about" is top-level (no parent). /page/foo/about should 404 —
    // it claims "about" has parent "foo", which is wrong.
    await h.factory.entry.create({
      type: "page",
      slug: "about",
      title: "About",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: null,
    });
    const response = await h.dispatch(
      new Request("https://cms.example/page/foo/about"),
    );
    expect(response.status).toBe(404);
  });
});

describe("resolvePublicRoute — single", () => {
  test("renders title + walked content for a published post", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Hello & <world>",
      content: TIPTAP_BODY,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/hello"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<title>Hello &amp; &lt;world&gt;</title>");
    expect(body).toContain("<h1>Hello &amp; &lt;world&gt;</h1>");
    expect(body).toContain("<p>Body.</p>");
  });

  test("draft with a matching slug returns 404 (status gate)", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "secret",
      title: "Secret",
      content: null,
      status: "draft",
      authorId: author.id,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/secret"),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("public-post-not-found");
  });

  test("trashed post returns 404", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "gone",
      title: "Gone",
      content: null,
      status: "trash",
      authorId: author.id,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/gone"),
    );
    expect(response.status).toBe(404);
  });
});

describe("resolvePublicRoute — archive", () => {
  test("lists published entries with hrefs honoring rewrite.slug", async () => {
    const h = await createDispatcherHarness({ plugins: [shopPlugin] });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "product",
      slug: "widget",
      title: "Widget",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-04-20"),
    });
    await h.factory.entry.create({
      type: "product",
      slug: "gadget",
      title: "Gadget",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-04-21"),
    });

    const response = await h.dispatch(new Request("https://cms.example/shop"));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<title>Products</title>");
    expect(body).toContain('<a href="/shop/gadget">Gadget</a>');
    expect(body).toContain('<a href="/shop/widget">Widget</a>');
    // Most recent first
    expect(body.indexOf("Gadget")).toBeLessThan(body.indexOf("Widget"));
  });

  test("archive with no published entries renders the empty-state copy", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const response = await h.dispatch(new Request("https://cms.example/post"));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<h1>Posts</h1>");
    expect(body).toContain("No entries yet.");
  });

  test("drafts do not appear in the archive", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "draft-one",
      title: "Draft One",
      content: null,
      status: "draft",
      authorId: author.id,
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    const body = await response.text();
    expect(body).toContain("No entries yet.");
    expect(body).not.toContain("Draft One");
  });

  test("page=2 returns the offset slice of entries", async () => {
    const h = await createDispatcherHarness({ plugins: [shopPlugin] });
    const author = await h.seedUser("admin");
    // Seed 25 entries — perPage=20 means page 2 has 5 entries.
    for (let i = 1; i <= 25; i++) {
      await h.factory.entry.create({
        type: "product",
        slug: `p-${String(i).padStart(2, "0")}`,
        title: `Product ${String(i).padStart(2, "0")}`,
        content: null,
        status: "published",
        authorId: author.id,
        publishedAt: new Date(`2026-04-${String(i).padStart(2, "0")}`),
      });
    }

    const response = await h.dispatch(
      new Request("https://cms.example/shop/page/2"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    // perPage=20, page 2 shows entries 1..5 (oldest, since newest are on page 1)
    expect(body).toContain("Product 05");
    expect(body).toContain("Product 01");
    expect(body).not.toContain("Product 25");
    expect(body).not.toContain("Product 06");
  });

  test("page > totalPages returns 404", async () => {
    const h = await createDispatcherHarness({ plugins: [shopPlugin] });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "product",
      slug: "only-one",
      title: "Only One",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/shop/page/99"),
    );
    expect(response.status).toBe(404);
  });

  test("non-numeric :page param returns 404", async () => {
    const h = await createDispatcherHarness({ plugins: [shopPlugin] });
    const response = await h.dispatch(
      new Request("https://cms.example/shop/page/abc"),
    );
    expect(response.status).toBe(404);
  });

  test("explicit /page/1 resolves the same content as the bare archive", async () => {
    const h = await createDispatcherHarness({ plugins: [shopPlugin] });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "product",
      slug: "thing",
      title: "Thing",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    const bare = await h.dispatch(new Request("https://cms.example/shop"));
    const paginated = await h.dispatch(
      new Request("https://cms.example/shop/page/1"),
    );
    expect(bare.status).toBe(200);
    expect(paginated.status).toBe(200);
    const bareBody = await bare.text();
    const paginatedBody = await paginated.text();
    expect(paginatedBody).toBe(bareBody);
  });

  test("empty archive on page=1 still returns 200 (regression from #224)", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const response = await h.dispatch(
      new Request("https://cms.example/post/page/1"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("No entries yet.");
  });

  test("archive title falls back label → entryType when labels.plural is absent", async () => {
    const plugin = definePlugin("docs", (ctx) => {
      ctx.registerEntryType("doc", {
        label: "Docs",
        isPublic: true,
        hasArchive: true,
      });
    });
    const h = await createDispatcherHarness({ plugins: [plugin] });
    const response = await h.dispatch(new Request("https://cms.example/doc"));
    const body = await response.text();
    expect(body).toContain("<title>Docs</title>");
  });
});

const taxonomyPlugin = definePlugin("blog", (ctx) => {
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

describe("resolvePublicRoute — taxonomy", () => {
  test("returns 404 when the term slug doesn't exist", async () => {
    const h = await createDispatcherHarness({ plugins: [taxonomyPlugin] });
    const response = await h.dispatch(
      new Request("https://cms.example/category/missing"),
    );
    expect(response.status).toBe(404);
  });

  test("renders a 200 empty archive when the term exists but has no entries", async () => {
    const h = await createDispatcherHarness({ plugins: [taxonomyPlugin] });
    await h.factory.category.create({ slug: "news", name: "News" });
    const response = await h.dispatch(
      new Request("https://cms.example/category/news"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<h1>News</h1>");
    expect(body).toContain("No entries yet.");
  });

  test("lists published entries tagged with the term, newest first", async () => {
    const h = await createDispatcherHarness({ plugins: [taxonomyPlugin] });
    const author = await h.seedUser("admin");
    const term = await h.factory.category.create({
      slug: "news",
      name: "News",
    });
    const older = await h.factory.entry.create({
      type: "post",
      slug: "older",
      title: "Older",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-04-01"),
    });
    const newer = await h.factory.entry.create({
      type: "post",
      slug: "newer",
      title: "Newer",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-04-20"),
    });
    await h.factory.entryTerm.create({ entryId: older.id, termId: term.id });
    await h.factory.entryTerm.create({ entryId: newer.id, termId: term.id });

    const response = await h.dispatch(
      new Request("https://cms.example/category/news"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Newer");
    expect(body).toContain("Older");
    expect(body.indexOf("Newer")).toBeLessThan(body.indexOf("Older"));
  });

  test("cross-entry-type taxonomy includes entries from every attached type", async () => {
    const multiTypePlugin = definePlugin("multi", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerEntryType("doc", { label: "Docs", isPublic: true });
      ctx.registerTermTaxonomy("topic", {
        label: "Topics",
        entryTypes: ["post", "doc"],
      });
    });
    const h = await createDispatcherHarness({ plugins: [multiTypePlugin] });
    const author = await h.seedUser("admin");
    const term = await h.factory.term.create({
      taxonomy: "topic",
      slug: "edge",
      name: "Edge",
    });
    const post = await h.factory.entry.create({
      type: "post",
      slug: "p",
      title: "Post P",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-04-10"),
    });
    const doc = await h.factory.entry.create({
      type: "doc",
      slug: "d",
      title: "Doc D",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-04-20"),
    });
    await h.factory.entryTerm.create({ entryId: post.id, termId: term.id });
    await h.factory.entryTerm.create({ entryId: doc.id, termId: term.id });

    const response = await h.dispatch(
      new Request("https://cms.example/topic/edge"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('<a href="/post/p">Post P</a>');
    expect(body).toContain('<a href="/doc/d">Doc D</a>');
  });

  test("resolve:taxonomy:data filter can drop entries before rendering", async () => {
    const filterPlugin = definePlugin("hide", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerTermTaxonomy("category", {
        label: "Categories",
        entryTypes: ["post"],
      });
      ctx.addFilter("resolve:taxonomy:data", (data) => {
        return {
          ...data,
          entries: data.entries.filter((e) => e.slug !== "hidden"),
        };
      });
    });
    const h = await createDispatcherHarness({ plugins: [filterPlugin] });
    const author = await h.seedUser("admin");
    const term = await h.factory.category.create({
      slug: "news",
      name: "News",
    });
    const shown = await h.factory.entry.create({
      type: "post",
      slug: "shown",
      title: "Shown",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-04-10"),
    });
    const hidden = await h.factory.entry.create({
      type: "post",
      slug: "hidden",
      title: "Hidden",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-04-20"),
    });
    await h.factory.entryTerm.create({ entryId: shown.id, termId: term.id });
    await h.factory.entryTerm.create({ entryId: hidden.id, termId: term.id });

    const response = await h.dispatch(
      new Request("https://cms.example/category/news"),
    );
    const body = await response.text();
    expect(body).toContain("Shown");
    expect(body).not.toContain("Hidden");
  });

  test("taxonomy page=2 returns the offset slice of tagged entries", async () => {
    const h = await createDispatcherHarness({ plugins: [taxonomyPlugin] });
    const author = await h.seedUser("admin");
    const term = await h.factory.category.create({
      slug: "news",
      name: "News",
    });
    for (let i = 1; i <= 25; i++) {
      const post = await h.factory.entry.create({
        type: "post",
        slug: `p-${String(i).padStart(2, "0")}`,
        title: `Tagged ${String(i).padStart(2, "0")}`,
        content: null,
        status: "published",
        authorId: author.id,
        publishedAt: new Date(`2026-04-${String(i).padStart(2, "0")}`),
      });
      await h.factory.entryTerm.create({ entryId: post.id, termId: term.id });
    }

    const response = await h.dispatch(
      new Request("https://cms.example/category/news/page/2"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    // perPage=20, page 2 shows the oldest 5 entries (newest 20 on page 1).
    expect(body).toContain("Tagged 05");
    expect(body).toContain("Tagged 01");
    expect(body).not.toContain("Tagged 25");
    expect(body).not.toContain("Tagged 06");
  });

  test("taxonomy page > totalPages returns 404", async () => {
    const h = await createDispatcherHarness({ plugins: [taxonomyPlugin] });
    const author = await h.seedUser("admin");
    const term = await h.factory.category.create({
      slug: "news",
      name: "News",
    });
    const post = await h.factory.entry.create({
      type: "post",
      slug: "only",
      title: "Only",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.factory.entryTerm.create({ entryId: post.id, termId: term.id });

    const response = await h.dispatch(
      new Request("https://cms.example/category/news/page/99"),
    );
    expect(response.status).toBe(404);
  });

  test("empty term on page=1 still returns 200 (regression from #224)", async () => {
    const h = await createDispatcherHarness({ plugins: [taxonomyPlugin] });
    await h.factory.category.create({ slug: "empty", name: "Empty" });
    const response = await h.dispatch(
      new Request("https://cms.example/category/empty/page/1"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("No entries yet.");
  });

  test("hierarchical taxonomy /<base>/parent/leaf resolves the nested term", async () => {
    const hierarchicalTaxPlugin = definePlugin("geo", (ctx) => {
      ctx.registerEntryType("post", {
        label: "Posts",
        isPublic: true,
        hasArchive: true,
      });
      ctx.registerTermTaxonomy("region", {
        label: "Regions",
        isHierarchical: true,
        entryTypes: ["post"],
      });
    });
    const h = await createDispatcherHarness({
      plugins: [hierarchicalTaxPlugin],
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
      slug: "wine",
      title: "Wine",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.factory.entryTerm.create({ entryId: post.id, termId: france.id });

    const response = await h.dispatch(
      new Request("https://cms.example/region/europe/france"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<h1>France</h1>");
    expect(body).toContain("Wine");
  });

  test("buildTermArchiveUrl round-trips through the route map", async () => {
    const hierarchicalTaxPlugin = definePlugin("geo", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerTermTaxonomy("region", {
        label: "Regions",
        isHierarchical: true,
        entryTypes: ["post"],
      });
    });
    const h = await createDispatcherHarness({
      plugins: [hierarchicalTaxPlugin],
    });
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

    const ctx = { db: h.db, plugins: h.app.plugins } as unknown as AppContext;
    const url = await buildTermArchiveUrl(ctx, {
      taxonomy: "region",
      slug: france.slug,
      parentId: france.parentId,
    });
    expect(url).toBe("/region/europe/france");

    const response = await h.dispatch(new Request(`https://cms.example${url}`));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<h1>France</h1>");
  });

  test("paginated hierarchical taxonomy resolves /region/europe/france/page/2", async () => {
    const hierarchicalTaxPlugin = definePlugin("geo", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerTermTaxonomy("region", {
        label: "Regions",
        isHierarchical: true,
        entryTypes: ["post"],
      });
    });
    const h = await createDispatcherHarness({
      plugins: [hierarchicalTaxPlugin],
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
    for (let i = 1; i <= 25; i++) {
      const post = await h.factory.entry.create({
        type: "post",
        slug: `p-${String(i).padStart(2, "0")}`,
        title: `Wine ${String(i).padStart(2, "0")}`,
        content: null,
        status: "published",
        authorId: author.id,
        publishedAt: new Date(`2026-04-${String(i).padStart(2, "0")}`),
      });
      await h.factory.entryTerm.create({ entryId: post.id, termId: france.id });
    }

    const response = await h.dispatch(
      new Request("https://cms.example/region/europe/france/page/2"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    // perPage=20, page 2 shows the oldest 5.
    expect(body).toContain("Wine 05");
    expect(body).toContain("Wine 01");
    expect(body).not.toContain("Wine 25");
    expect(body).not.toContain("Wine 06");
  });

  test("hierarchical taxonomy with mismatched ancestor returns 404", async () => {
    const hierarchicalTaxPlugin = definePlugin("geo", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerTermTaxonomy("region", {
        label: "Regions",
        isHierarchical: true,
        entryTypes: ["post"],
      });
    });
    const h = await createDispatcherHarness({
      plugins: [hierarchicalTaxPlugin],
    });
    const europe = await h.factory.term.create({
      taxonomy: "region",
      slug: "europe",
      name: "Europe",
    });
    await h.factory.term.create({
      taxonomy: "region",
      slug: "france",
      name: "France",
      parentId: europe.id,
    });
    // /region/asia/france — "france" exists under "europe", not "asia".
    const response = await h.dispatch(
      new Request("https://cms.example/region/asia/france"),
    );
    expect(response.status).toBe(404);
  });

  test("draft entries tagged with the term are excluded", async () => {
    const h = await createDispatcherHarness({ plugins: [taxonomyPlugin] });
    const author = await h.seedUser("admin");
    const term = await h.factory.category.create({
      slug: "news",
      name: "News",
    });
    const draft = await h.factory.entry.create({
      type: "post",
      slug: "draft",
      title: "Draft",
      content: null,
      status: "draft",
      authorId: author.id,
    });
    await h.factory.entryTerm.create({ entryId: draft.id, termId: term.id });

    const response = await h.dispatch(
      new Request("https://cms.example/category/news"),
    );
    const body = await response.text();
    expect(body).toContain("No entries yet.");
    expect(body).not.toContain("Draft");
  });
});
