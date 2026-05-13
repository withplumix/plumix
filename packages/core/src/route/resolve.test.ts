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
