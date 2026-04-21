import { describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerPostType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

const shopPlugin = definePlugin("shop", (ctx) => {
  ctx.registerPostType("product", {
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
    await h.factory.post.create({
      type: "post",
      slug: "hello",
      title: "Hello & <world>",
      content: JSON.stringify(TIPTAP_BODY),
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
    await h.factory.post.create({
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
    await h.factory.post.create({
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

  test("legacy HTML content renders empty (walker rejects non-JSON)", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const author = await h.seedUser("admin");
    await h.factory.post.create({
      type: "post",
      slug: "legacy",
      title: "Legacy",
      content: "<p>old html</p>",
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/legacy"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<h1>Legacy</h1>");
    expect(body).not.toContain("<p>old html</p>");
  });
});

describe("resolvePublicRoute — archive", () => {
  test("lists published posts with hrefs honoring rewrite.slug", async () => {
    const h = await createDispatcherHarness({ plugins: [shopPlugin] });
    const author = await h.seedUser("admin");
    await h.factory.post.create({
      type: "product",
      slug: "widget",
      title: "Widget",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-04-20"),
    });
    await h.factory.post.create({
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

  test("archive with no published posts renders the empty-state copy", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const response = await h.dispatch(new Request("https://cms.example/post"));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<h1>Posts</h1>");
    expect(body).toContain("No posts yet.");
  });

  test("drafts do not appear in the archive", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const author = await h.seedUser("admin");
    await h.factory.post.create({
      type: "post",
      slug: "draft-one",
      title: "Draft One",
      content: null,
      status: "draft",
      authorId: author.id,
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    const body = await response.text();
    expect(body).toContain("No posts yet.");
    expect(body).not.toContain("Draft One");
  });

  test("archive title falls back label → postType when labels.plural is absent", async () => {
    const plugin = definePlugin("docs", (ctx) => {
      ctx.registerPostType("doc", {
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
