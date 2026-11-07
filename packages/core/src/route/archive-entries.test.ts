import { describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { testSite } from "../test/site.js";
import { archiveAtPath, archiveBaseRoutes } from "./archive-entries.js";
import { listEntryPage } from "./render/entry-listing.js";

const archives = definePlugin("site", {
  setup: (ctx) => {
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
    ctx.registerTermTaxonomy("topic", {
      label: "Topics",
      entryTypes: ["post"],
    });
    ctx.registerTermTaxonomy("region", {
      label: "Regions",
      entryTypes: ["post"],
      isHierarchical: true,
    });
    ctx.registerArchiveType("talks", {
      routes: ["/talks/:track"],
      entries: (q, params) =>
        params.track === "none" ? null : q.inTerm("topic", params.track ?? ""),
      title: "Talks",
    });
    ctx.registerArchiveType("legacy", {
      routes: ["/legacy/:x"],
      resolve: () => ({
        data: { kind: "archiveType", name: "legacy" },
        title: "L",
      }),
    });
    ctx.registerView("compare", {
      routes: ["/compare/:id"],
      resolve: () => ({ data: null, title: "Compare" }),
    });
  },
});

const site = await testSite({ plugins: [archives] });

describe("archiveAtPath", () => {
  test.each([
    ["/", { kind: "frontPage" }, {}],
    ["/page/2", { kind: "frontPage" }, { page: "2" }],
    ["/post", { kind: "entryType", entryType: "post" }, {}],
    ["/all-pages", { kind: "entryType", entryType: "page" }, {}],
    [
      "/all-pages/page/3",
      { kind: "entryType", entryType: "page" },
      { page: "3" },
    ],
    ["/topic/news", { kind: "term", taxonomy: "topic" }, { term: "news" }],
    [
      "/region/europe/france",
      { kind: "term", taxonomy: "region" },
      { path: "europe/france" },
    ],
    ["/authors/jane", { kind: "author" }, { slug: "jane" }],
    ["/2026/04", { kind: "date" }, { year: "2026", month: "04" }],
    ["/talks/news", { kind: "archiveType", name: "talks" }, { track: "news" }],
  ])("%s is its archive", (path, archive, params) => {
    const found = archiveAtPath(site.context, path);
    expect(found?.archive).toEqual(archive);
    expect(found?.params).toEqual(params);
  });

  test.each([
    ["a single entry", "/post/hello"],
    ["the search page", "/search/hello"],
    ["a plugin archive without entries", "/legacy/x"],
    ["a view", "/compare/abc"],
    ["params a plugin archive declines", "/talks/none"],
    ["an unknown path", "/no/such/thing"],
  ])("%s is no archive", (_what, path) => {
    expect(archiveAtPath(site.context, path)).toBeNull();
  });

  test.each([
    ["/", ["untagged", "tagged"]],
    ["/all-pages", ["a-page"]],
    ["/topic/t", ["tagged"]],
    ["/talks/t", ["a-page", "tagged"]],
    ["/2026", ["untagged", "tagged"]],
  ])(
    "the query at %s lists what the archive's page lists",
    async (path, listed) => {
      const author = await site.factory.author.create({ slug: "jane" });
      const topic = await site.factory.term.create({
        taxonomy: "topic",
        slug: "t",
      });
      const publishedAt = new Date("2026-04-10T12:00:00Z");
      const tagged = await site.factory.published.create({
        type: "post",
        slug: "tagged",
        title: "Title tagged",
        authorId: author.id,
        publishedAt,
      });
      await site.factory.published.create({
        type: "post",
        slug: "untagged",
        title: "Title untagged",
        authorId: author.id,
        publishedAt,
      });
      const aPage = await site.factory.published.create({
        type: "page",
        slug: "a-page",
        title: "Title a-page",
        authorId: author.id,
        publishedAt,
      });
      await site.factory.entryTerm.create({
        entryId: tagged.id,
        termId: topic.id,
      });
      await site.factory.entryTerm.create({
        entryId: aPage.id,
        termId: topic.id,
      });
      const ctx = site.context;

      const found = archiveAtPath(ctx, path);
      if (found === null) throw new Error(`no archive at ${path}`);
      const listing = await listEntryPage(ctx, found.entries, {
        page: 1,
        perPage: 20,
      });

      expect(listing?.entries.map((entry) => entry.slug)).toEqual(listed);
      const page = await site.visit(path);
      page.assertSeeInOrder(listed.map((slug) => `Title ${slug}`));
    },
  );
});

const rooted = await testSite({
  plugins: [
    definePlugin("rooted", {
      setup: (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
        ctx.registerRewriteRule("/", { kind: "entryType", entryType: "post" });
      },
    }),
  ],
});

const withoutAuthorOrDate = await testSite({
  plugins: [archives],
  config: { routes: { author: false, date: false } },
});

describe("archiveBaseRoutes", () => {
  test("lists every entry-query archive's unpaginated routes", () => {
    expect(archiveBaseRoutes(site.context.plugins)).toEqual(
      expect.arrayContaining([
        { archive: { kind: "frontPage" }, pattern: "/" },
        { archive: { kind: "author" }, pattern: "/authors/:slug" },
        { archive: { kind: "date" }, pattern: "/:year(\\d{4})" },
        {
          archive: { kind: "term", taxonomy: "topic" },
          pattern: "/topic/:term",
        },
        { archive: { kind: "entryType", entryType: "post" }, pattern: "/post" },
        {
          archive: { kind: "entryType", entryType: "page" },
          pattern: "/all-pages",
        },
        {
          archive: { kind: "archiveType", name: "talks" },
          pattern: "/talks/:track",
        },
      ]),
    );
  });

  test("names no front page at the root a rule claims for another archive", () => {
    const ctx = rooted.context;

    expect(
      archiveBaseRoutes(ctx.plugins).filter((route) => route.pattern === "/"),
    ).toEqual([
      { archive: { kind: "entryType", entryType: "post" }, pattern: "/" },
    ]);
    expect(archiveAtPath(ctx, "/")?.archive).toEqual({
      kind: "entryType",
      entryType: "post",
    });
  });

  test("leaves out later pages, search and archives without entries", () => {
    const patterns = archiveBaseRoutes(site.context.plugins).map(
      (route) => route.pattern,
    );
    expect(patterns.filter((pattern) => pattern.includes("/page/"))).toEqual(
      [],
    );
    expect(patterns.filter((pattern) => pattern.startsWith("/search"))).toEqual(
      [],
    );
    expect(patterns).not.toContain("/legacy/:x");
    expect(patterns).not.toContain("/compare/:id");
  });

  test("names no author or date archive where the site turned those routes off", () => {
    const ctx = withoutAuthorOrDate.context;

    const kinds = archiveBaseRoutes(ctx.plugins).map(
      (route) => route.archive.kind,
    );
    expect(kinds).not.toContain("author");
    expect(kinds).not.toContain("date");
    expect(kinds).toContain("frontPage");
    expect(archiveAtPath(ctx, "/authors/jane")).toBeNull();
    expect(archiveAtPath(ctx, "/2026/04")).toBeNull();
  });
});
