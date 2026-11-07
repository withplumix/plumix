import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const feeds = definePlugin("feeds", {
  setup: (ctx) => {
    ctx.registerPublicRoute({
      path: "/feed",
      handler: () => new Response("owned", { status: 200 }),
    });
  },
});

const site = await testSite({
  plugins: [blog, feeds],
  config: {
    redirects: [
      { from: "/feed", to: "/elsewhere", status: 301 },
      { from: "/old.png", to: "/new.png" },
      { from: "/post/moved", to: "/post/kept", status: 301 },
    ],
  },
});

describe("routing a public request — stage order", () => {
  test("a public route answers ahead of a redirect for the same path", async () => {
    const page = await site.visit("/feed");

    page.assertOk().assertSee("owned");
  });

  test("a redirect on an asset-shaped path answers ahead of the asset 404", async () => {
    const page = await site.visit("/old.png");

    page.assertStatus(301).assertRedirect("/new.png");
  });

  test("an asset-shaped path with no redirect 404s before content routing", async () => {
    const page = await site.visit("/missing.png");

    page.assertNotFound().assertHeader("cache-control", "public, max-age=300");
  });

  test("a redirect answers ahead of a content route at the same path", async () => {
    const page = await site.visit("/post/moved");

    page.assertRedirect("/post/kept");
  });

  test("a non-canonical URL 301s ahead of the content route it would match", async () => {
    const page = await site.visit("/post/hello/?ref=x");

    page
      .assertStatus(301)
      .assertRedirect("https://cms.example/post/hello?ref=x");
  });

  test("a canonical content URL reaches the route map", async () => {
    await site.factory.published.create({ type: "post", slug: "hello" });

    const page = await site.visit("/post/hello");

    page.assertOk().assertRoute("/post/:slug");
  });

  test("a method other than GET or HEAD is refused before any stage runs", async () => {
    const page = await site.visit("/feed", { method: "POST" });

    page.assertStatus(405).assertHeader("allow", "GET, HEAD");
  });
});

describe("routing a public request — unmatched content", () => {
  test("an unmatched root is the front page, and renders as one", async () => {
    const page = await site.visit("/");

    page.assertOk().assertRoute("/");
  });

  test("any other unmatched path has no route and renders a 404", async () => {
    const page = await site.visit("/nowhere/at-all");

    page.assertNotFound();
    expect(() => page.assertRoute("/")).toThrow(
      'assertRoute: expected route "/", but no content route matched.',
    );
  });
});
