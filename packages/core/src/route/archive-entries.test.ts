import { beforeEach, describe, expect, test } from "vitest";

import type { DispatcherHarness } from "../test/dispatcher.js";
import { definePlugin } from "../plugin/define.js";
import { createTestContext } from "../test/context.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { archiveAtPath, archiveBaseRoutes } from "./archive-entries.js";
import { listEntryPage } from "./render/entry-listing.js";

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
  ctx.registerTermTaxonomy("topic", { label: "Topics", entryTypes: ["post"] });
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
    resolve: () => ({ data: { kind: "custom", name: "legacy" }, title: "L" }),
  });
});

let h: DispatcherHarness;

beforeEach(async () => {
  h = await createDispatcherHarness({ plugins: [site] });
});

describe("archiveAtPath", () => {
  test.each([
    ["/", { kind: "front-page" }, {}],
    ["/page/2", { kind: "front-page" }, { page: "2" }],
    ["/post", { kind: "archive", entryType: "post" }, {}],
    ["/all-pages", { kind: "archive", entryType: "page" }, {}],
    [
      "/all-pages/page/3",
      { kind: "archive", entryType: "page" },
      { page: "3" },
    ],
    ["/topic/news", { kind: "taxonomy", taxonomy: "topic" }, { term: "news" }],
    [
      "/region/europe/france",
      { kind: "taxonomy", taxonomy: "region" },
      { path: "europe/france" },
    ],
    ["/authors/jane", { kind: "author" }, { slug: "jane" }],
    ["/2026/04", { kind: "date" }, { year: "2026", month: "04" }],
    ["/talks/news", { kind: "custom", name: "talks" }, { track: "news" }],
  ])("%s is its archive", (path, archive, params) => {
    const found = archiveAtPath(h.app, path);
    expect(found?.archive).toEqual(archive);
    expect(found?.params).toEqual(params);
  });

  test.each([
    ["a single entry", "/post/hello"],
    ["the search page", "/search/hello"],
    ["a plugin archive without entries", "/legacy/x"],
    ["params a plugin archive declines", "/talks/none"],
    ["an unknown path", "/no/such/thing"],
  ])("%s is no archive", (_what, path) => {
    expect(archiveAtPath(h.app, path)).toBeNull();
  });

  test.each(["/", "/all-pages", "/topic/t", "/talks/t", "/2026"])(
    "the query at %s lists what the archive's page lists",
    async (path) => {
      const ctx = createTestContext({
        db: h.db,
        hooks: h.app.hooks,
        plugins: h.app.plugins,
      });
      const author = await h.factory.author.create({ slug: "jane" });
      const topic = await h.factory.term.create({
        taxonomy: "topic",
        slug: "t",
      });
      for (const [type, slug] of [
        ["post", "tagged"],
        ["post", "untagged"],
        ["page", "a-page"],
      ] as const) {
        const entry = await h.factory.entry.create({
          type,
          slug,
          title: `Title ${slug}`,
          status: "published",
          authorId: author.id,
          publishedAt: new Date("2026-04-10T12:00:00Z"),
        });
        if (slug !== "untagged") {
          await h.factory.entryTerm.create({
            entryId: entry.id,
            termId: topic.id,
          });
        }
      }

      const found = archiveAtPath(h.app, path);
      if (found === null) throw new Error(`no archive at ${path}`);
      const listing = await listEntryPage(ctx, found.entries, {
        page: 1,
        perPage: 20,
      });
      const body = await (
        await h.dispatch(new Request(`https://cms.example${path}`))
      ).text();
      const onPage = ["tagged", "untagged", "a-page"].filter((slug) =>
        body.includes(`Title ${slug}`),
      );
      expect(onPage).not.toEqual([]);
      expect(listing?.entries.map((entry) => entry.slug).sort()).toEqual(
        onPage.sort(),
      );
    },
  );
});

describe("archiveBaseRoutes", () => {
  test("lists every entry-query archive's unpaginated routes", () => {
    expect(archiveBaseRoutes(h.app.plugins)).toEqual(
      expect.arrayContaining([
        { archive: { kind: "front-page" }, pattern: "/" },
        { archive: { kind: "author" }, pattern: "/authors/:slug" },
        { archive: { kind: "date" }, pattern: "/:year(\\d{4})" },
        {
          archive: { kind: "taxonomy", taxonomy: "topic" },
          pattern: "/topic/:term",
        },
        { archive: { kind: "archive", entryType: "post" }, pattern: "/post" },
        {
          archive: { kind: "archive", entryType: "page" },
          pattern: "/all-pages",
        },
        {
          archive: { kind: "custom", name: "talks" },
          pattern: "/talks/:track",
        },
      ]),
    );
  });

  test("names no front page at the root a rule claims for another archive", async () => {
    const rooted = definePlugin("rooted", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerRewriteRule("/", { kind: "archive", entryType: "post" });
    });
    const { app } = await createDispatcherHarness({ plugins: [rooted] });

    expect(
      archiveBaseRoutes(app.plugins).filter((route) => route.pattern === "/"),
    ).toEqual([
      { archive: { kind: "archive", entryType: "post" }, pattern: "/" },
    ]);
    expect(archiveAtPath(app, "/")?.archive).toEqual({
      kind: "archive",
      entryType: "post",
    });
  });

  test("leaves out later pages, search and archives without entries", () => {
    const patterns = archiveBaseRoutes(h.app.plugins).map(
      (route) => route.pattern,
    );
    expect(patterns.filter((pattern) => pattern.includes("/page/"))).toEqual(
      [],
    );
    expect(patterns.filter((pattern) => pattern.startsWith("/search"))).toEqual(
      [],
    );
    expect(patterns).not.toContain("/legacy/:x");
  });
});
