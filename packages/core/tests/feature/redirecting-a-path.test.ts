import { describe, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { fallback } from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const legacy = definePlugin("legacy", {
  setup: (ctx) => {
    ctx.registerRedirects([
      { from: "/old/guide", to: "/guides/start", status: 308 },
      { from: "/legacy/*", gone: true },
    ]);
  },
});

const site = await testSite({
  plugins: [legacy],
  config: {
    redirects: [
      { from: "/img/old-logo.png", to: "/img/new-logo.png" },
      { from: "/team/:slug", to: "/about/:slug", status: 301 },
      { from: "/dup", to: "/from-config" },
    ],
    theme: defineTheme({
      templates: [fallback(() => null)],
      redirects: [
        { from: "/post/:slug", to: "/blog/:slug", status: 308 },
        { from: "/dup", to: "/from-theme" },
      ],
    }),
  },
});

describe("a public redirect", () => {
  test("a plugin-registered redirect is served as a 308 with Location", async () => {
    const page = await site.visit("/old/guide");

    page.assertStatus(308).assertRedirect("/guides/start");
  });

  test("a `gone` rule is served as a 410", async () => {
    const page = await site.visit("/legacy/anything");

    page.assertStatus(410);
  });

  test("a moved static asset redirects instead of 404ing", async () => {
    const page = await site.visit("/img/old-logo.png");

    page.assertStatus(301).assertRedirect("/img/new-logo.png");
  });

  test("a site `config.redirects` rule is served", async () => {
    const page = await site.visit("/team/ada");

    page.assertStatus(301).assertRedirect("/about/ada");
  });

  test("a theme-declared redirect is served", async () => {
    const page = await site.visit("/post/hello");

    page.assertStatus(308).assertRedirect("/blog/hello");
  });

  test("config outranks a theme rule for the same path", async () => {
    const page = await site.visit("/dup");

    page.assertRedirect("/from-config");
  });
});

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const blogSite = await testSite({
  plugins: [blog],
  config: {
    redirects: [{ from: "/post/moved", to: "/post/kept", status: 301 }],
  },
});

describe("a redirect at a published entry's path", () => {
  test("shadows the entry, ahead of content routing", async () => {
    await blogSite.factory.published.create({ type: "post", slug: "moved" });

    const page = await blogSite.visit("/post/moved");

    page.assertStatus(301);
  });

  test("leaves an un-redirected sibling resolving", async () => {
    await blogSite.factory.published.create({ type: "post", slug: "kept" });

    const page = await blogSite.visit("/post/kept");

    page.assertOk();
  });
});
