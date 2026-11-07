import { describe, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
  },
});

const rootPagesPlugin = definePlugin("pages", {
  setup: (ctx) => {
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      rewrite: { slug: "" },
    });
  },
});

const withoutDates = await testSite({
  plugins: [blogPlugin, rootPagesPlugin],
  config: { routes: { date: false } },
});
const withoutAuthors = await testSite({
  plugins: [blogPlugin],
  config: { routes: { author: false } },
});
const withoutSearch = await testSite({
  plugins: [blogPlugin, rootPagesPlugin],
  config: { routes: { search: false } },
});

describe("a site that turns off the date archive", () => {
  test("date off: a root page slugged 2026 resolves", async () => {
    await withoutDates.factory.published.create({
      type: "page",
      slug: "2026",
      title: "Page 2026",
    });

    const page = await withoutDates.visit("/2026");

    page.assertOk().assertSee("<h1>Page 2026</h1>");
  });

  test.each(["/2026/10", "/2026/10/03", "/2026/page/2"])(
    "date off: %s 404s",
    async (path) => {
      await withoutDates.factory.published.create({
        type: "page",
        slug: "2026",
        title: "Page 2026",
      });

      const page = await withoutDates.visit(path);

      page.assertNotFound();
    },
  );
});

describe("a site that turns off the author archive", () => {
  test.each(["/authors/jane", "/authors/jane/page/2"])(
    "author off: an existing author's archive (%s) 404s",
    async (path) => {
      await withoutAuthors.factory.author.create({
        name: "Jane",
        slug: "jane",
      });

      const page = await withoutAuthors.visit(path);

      page.assertNotFound();
    },
  );
});

describe("a site that turns off search", () => {
  test("search off: /search?q= is not redirected, and a root page slugged search resolves", async () => {
    await withoutSearch.factory.published.create({
      type: "page",
      slug: "search",
      title: "Page search",
    });

    const page = await withoutSearch.visit("/search?q=hello");

    page.assertOk().assertSee("<h1>Page search</h1>");
  });

  test("search off: /search/<q> 404s", async () => {
    await withoutSearch.factory.published.create({
      type: "page",
      slug: "search",
      title: "Page search",
    });

    const page = await withoutSearch.visit("/search/hello");

    page.assertNotFound();
  });
});
