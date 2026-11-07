import { describe, expect, test } from "vitest";

import type { TelemetrySpan } from "../../src/telemetry-snapshot.js";
import type { TestSite } from "../../src/test/site.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

/**
 * Every built-in archive lists its own entry query (ADR 0008). Each seed here
 * is one the hand-written listings and the feeds used to disagree on.
 */
const archiveQueriesPlugin = definePlugin("archive-queries", {
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
    ctx.registerEntryType("secret", { label: "Secrets", isPublic: false });
    ctx.registerTermTaxonomy("topic", {
      label: "Topics",
      entryTypes: ["post", "secret"],
    });
    ctx.registerTermTaxonomy("tag", { label: "Tags" });
  },
});

const site = await testSite({ plugins: [archiveQueriesPlugin] });

const SLUGS = [
  "a-post",
  "a-page",
  "a-secret",
  "undated-post",
  "undated-page",
] as const;

/** One entry of each kind, every one filed under topic `t` and tag `g`. */
async function seedArchive(): Promise<void> {
  const author = await site.factory.author.create({
    name: "Jane",
    slug: "jane",
  });
  const at = new Date("2026-04-10T12:00:00Z");
  const seed = (type: string, slug: string, publishedAt: Date | null = at) =>
    site.factory.entry.create({
      type,
      slug,
      title: `Title ${slug}`,
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt,
    });
  const post = await seed("post", "a-post");
  const page = await seed("page", "a-page");
  const secret = await seed("secret", "a-secret");
  const undated = await seed("post", "undated-post", null);
  const undatedPage = await seed("page", "undated-page", null);
  const topic = await site.factory.term.create({
    taxonomy: "topic",
    slug: "t",
  });
  const tag = await site.factory.term.create({ taxonomy: "tag", slug: "g" });
  for (const entry of [post, page, secret, undated, undatedPage]) {
    await site.factory.entryTerm.create({
      entryId: entry.id,
      termId: topic.id,
    });
    await site.factory.entryTerm.create({ entryId: entry.id, termId: tag.id });
  }
}

/**
 * Visits `path` and asserts it answers, listing the seeded entries `slugs`
 * names and no other.
 */
async function assertLists(
  on: TestSite,
  path: string,
  slugs: readonly string[],
): Promise<void> {
  const page = await on.visit(path);
  page.assertOk();
  for (const slug of SLUGS) {
    if (slugs.includes(slug)) page.assertSee(`Title ${slug}`);
    else page.assertDontSee(`Title ${slug}`);
  }
}

describe("each built-in archive lists its entry query", () => {
  test.each([
    ["the front page", "/"],
    ["an author archive", "/authors/jane"],
    ["a date archive", "/2026"],
    ["a type archive", "/post"],
  ])("%s lists non-hierarchical public entries", async (_kind, path) => {
    await seedArchive();

    await assertLists(site, path, ["a-post"]);
  });

  test("a type archive for a hierarchical type still lists its entries", async () => {
    await seedArchive();

    await assertLists(site, "/all-pages", ["a-page"]);
  });

  test("a term page lists its taxonomy's public types, never a non-public one", async () => {
    await seedArchive();

    await assertLists(site, "/topic/t", ["a-post"]);
  });

  test("a term page of a taxonomy declaring no types lists every public type", async () => {
    await seedArchive();

    await assertLists(site, "/tag/g", ["a-post", "a-page"]);
  });
});

const flat = definePlugin("flat", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerTermTaxonomy("section", {
      label: "Sections",
      entryTypes: ["post"],
      isHierarchical: true,
      rewrite: { isHierarchical: false },
    });
  },
});

const flatSite = await testSite({ plugins: [flat] });

describe("a term page of a taxonomy with flat URLs", () => {
  test("a child term of a taxonomy with flat URLs lists at its slug alone", async () => {
    const parent = await flatSite.factory.term.create({
      taxonomy: "section",
      slug: "outer",
    });
    const child = await flatSite.factory.term.create({
      taxonomy: "section",
      slug: "inner",
      parentId: parent.id,
    });
    const post = await flatSite.factory.published.create({
      type: "post",
      slug: "a-post",
      title: "Title a-post",
      publishedAt: new Date("2026-04-10T12:00:00Z"),
    });
    await flatSite.factory.entryTerm.create({
      entryId: post.id,
      termId: child.id,
    });

    await assertLists(flatSite, "/section/inner", ["a-post"]);
  });
});

/** Every SQL statement the site's requests ran, in the order they ran. */
function sqlRun(on: TestSite): string[] {
  const walk = (span: TelemetrySpan): TelemetrySpan[] => [
    span,
    ...span.children.flatMap(walk),
  ];
  return on.telemetry.snapshots
    .flatMap((snapshot) => snapshot.spans.flatMap(walk))
    .filter((span) => span.name.startsWith("db:"))
    .map((span) => span.attributes["db.sql"])
    .filter((sql) => typeof sql === "string");
}

describe("an archive's subject", () => {
  test.each([
    ["a term page", "/topic/t", '"terms"'],
    ["an author page", "/authors/jane", '"users"'],
  ])("%s looks its subject up once", async (_kind, path, table) => {
    const author = await site.factory.author.create({
      name: "Jane",
      slug: "jane",
    });
    const topic = await site.factory.term.create({
      taxonomy: "topic",
      slug: "t",
    });
    const post = await site.factory.published.create({
      type: "post",
      authorId: author.id,
      publishedAt: new Date("2026-04-10T12:00:00Z"),
    });
    await site.factory.entryTerm.create({ entryId: post.id, termId: topic.id });

    const page = await site.visit(path);

    page.assertOk();
    const lookups = sqlRun(site).filter(
      (sql) => sql.includes(`from ${table}`) && sql.includes('"slug" = ?'),
    );
    expect(lookups).toHaveLength(1);
  });
});
