import { describe, expect, expectTypeOf, test } from "vitest";

import type { AppContext } from "../../context/app-context.js";
import type { ResolvedNode } from "../contract/resolved-node.js";
import type { ListingPageTarget } from "./page-data.js";
import { requestStore } from "../../context/stores.js";
import { render } from "../../events-and-filters/render.js";
import { definePlugin } from "../../plugin/define.js";
import { date } from "../../plugin/fields/temporal.js";
import {
  photoField,
  photoLookupAdapter,
  photoProfilePlugin,
  photoUrl,
} from "../../test/photo-lookup.js";
import { testSite } from "../../test/site.js";
import { resolveListingPage } from "./page-data.js";
import { forTermTaxonomy } from "./template-builders.js";
import { resolveTemplate } from "./template-hierarchy.js";

/**
 * Declared with `.returns("date")` so the term decode pass is visible in what
 * the archive carries: `meta` holds the `Date`, `storedMeta` the ISO string.
 */
const _categoryDateFields = [date("launchedOn").returns("date")];
declare module "../../plugin/fields/contributions.js" {
  interface TermMetaContributions {
    categoryDates: {
      termTaxonomies: "category";
      fields: typeof _categoryDateFields;
    };
  }
}

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      labels: { plural: "Posts", singular: "Post" },
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerEntryType("note", { label: "Notes", isPublic: true });
    ctx.registerEntryType("secret", { label: "Secrets", isPublic: false });
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      entryTypes: ["post"],
    });
    ctx.registerTermMetaBox("categoryDates", {
      label: "Dates",
      termTaxonomies: ["category"],
      fields: _categoryDateFields,
    });
    ctx.registerTermTaxonomy("mood", {
      label: "Moods",
      entryTypes: ["post"],
      isPublic: false,
    });
  },
});

/**
 * Gives a category term a `featured` role field, so the term archive has an
 * image to project.
 */
const termArt = definePlugin("term-art", {
  setup: (ctx) => {
    ctx.registerLookupAdapter({ kind: "photo", adapter: photoLookupAdapter });
    ctx.registerTermMetaBox("categoryArt", {
      label: "Art",
      termTaxonomies: ["category"],
      fields: [photoField("banner", { role: "featured" })],
    });
  },
});

const seen: Record<string, string>[] = [];
const recording = definePlugin("recording", {
  setup: (ctx) => {
    ctx.filters.add(render.archiveEntries, (query, { archive, params }) => {
      seen.push(params);
      return archive.kind === "date" ? query.none() : query;
    });
  },
});

const regions = definePlugin("regions", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerTermTaxonomy("region", {
      label: "Regions",
      entryTypes: ["post"],
      isHierarchical: true,
    });
  },
});

const site = await testSite({ plugins: [blog] });
const recordingSite = await testSite({ plugins: [blog, recording] });
const regionSite = await testSite({ plugins: [regions] });
const portraitSite = await testSite({ plugins: [blog, photoProfilePlugin] });
const termArtSite = await testSite({ plugins: [blog, termArt] });

async function seedPost(
  on: typeof site,
  overrides: { title?: string; publishedAt?: Date } = {},
): Promise<number> {
  const entry = await on.factory.entry.create({
    type: "post",
    title: overrides.title ?? "Hello",
    status: "published",
    publishedAt: overrides.publishedAt ?? new Date("2026-03-04T00:00:00.000Z"),
  });
  return entry.id;
}

/** The SQL of every driver query `ctx` ran. */
function sqlOf(ctx: AppContext): string[] {
  return ctx.telemetry
    .getSpans()
    .filter((span) => span.name.startsWith("db:"))
    .map((span) => span.attributes["db.sql"])
    .filter((sql) => typeof sql === "string");
}

describe("resolveListingPage", () => {
  test("resolves the front page with the entries it lists", async () => {
    await seedPost(site, { title: "Front matter" });

    const page = await resolveListingPage(site.context, {
      kind: "frontPage",
    });

    expect(page?.node).toEqual({ kind: "frontPage" });
    expect(page?.data.kind).toBe("frontPage");
    expect(page?.data.pagination.total).toBe(1);
  });

  test("hands render.archiveEntries the params the page's URL would capture", async () => {
    await seedPost(recordingSite);

    const page = await resolveListingPage(recordingSite.context, {
      kind: "date",
      year: 2026,
      month: 3,
      day: null,
    });

    // Narrowed to nothing, the period has no page (ADR 0029).
    expect(page).toBeNull();
    expect(seen).toEqual([{ year: "2026", month: "03" }]);
  });

  test("resolves an entry type's archive and names it with its label", async () => {
    await seedPost(site);

    const page = await resolveListingPage(site.context, {
      kind: "entryType",
      entryType: "post",
    });

    expect(page?.node).toEqual({
      kind: "entryType",
      entryType: "post",
    });
    expect(page?.title).toBe("Posts");
  });

  test("has no archive page for a type that was registered without one", async () => {
    expect(
      await resolveListingPage(site.context, {
        kind: "entryType",
        entryType: "note",
      }),
    ).toBeNull();
  });

  test("has no archive page for a private type", async () => {
    expect(
      await resolveListingPage(site.context, {
        kind: "entryType",
        entryType: "secret",
      }),
    ).toBeNull();
  });

  test("resolves a term by id, with the entries filed under it", async () => {
    const entryId = await seedPost(site);
    const term = await site.factory.term.create({
      taxonomy: "category",
      name: "Design",
      slug: "design",
    });
    await site.factory.entryTerm.create({ entryId, termId: term.id });

    const page = await resolveListingPage(site.context, {
      kind: "term",
      id: term.id,
    });

    expect(page?.node).toEqual({
      kind: "term",
      taxonomy: "category",
      slug: "design",
      databaseId: term.id,
    });
    expect(page?.data.pagination.total).toBe(1);
  });

  // A decoded `Date` can't match a rule literal by `===`, so
  // `termMetaEquals` reads `storedMeta`.
  test("a term archive is decoded, and a whereMeta rule still matches its stored meta", async () => {
    const term = await site.factory.term.create({
      taxonomy: "category",
      name: "Design",
      slug: "design",
      meta: { launchedOn: "2026-01-01" },
    });

    const page = await resolveListingPage(site.context, {
      kind: "term",
      id: term.id,
    });
    if (page?.data.kind !== "term") throw new Error("expected a term page");

    expect(page.data.term.meta.launchedOn).toEqual(
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(page.data.term.storedMeta).toEqual({ launchedOn: "2026-01-01" });

    const launched = forTermTaxonomy("category")
      .whereMeta("launchedOn", "2026-01-01")
      .template(() => null);
    expect(resolveTemplate([launched], page.node, page.data)).toBe(launched);
  });

  test("has no term page in a private taxonomy", async () => {
    const term = await site.factory.term.create({
      taxonomy: "mood",
      name: "Wistful",
      slug: "wistful",
    });

    expect(
      await resolveListingPage(site.context, {
        kind: "term",
        id: term.id,
      }),
    ).toBeNull();
  });

  test("has no term page for an id no term carries", async () => {
    expect(
      await resolveListingPage(site.context, { kind: "term", id: 9999 }),
    ).toBeNull();
  });

  test("resolves an author by id without leaking the user row", async () => {
    const author = await site.factory.user.create({ role: "admin" });
    await site.factory.entry.create({
      type: "post",
      title: "Bylined",
      status: "published",
      publishedAt: new Date("2026-03-04T00:00:00.000Z"),
      authorId: author.id,
    });

    const page = await resolveListingPage(site.context, {
      kind: "author",
      id: author.id,
    });

    expect(page?.data.kind).toBe("author");
    expect(
      page?.data.kind === "author" ? Object.keys(page.data.author).sort() : [],
      // `images` is the only thing a role adds: the meta bag it was read from
      // does not travel with the author, so nothing else of the row does.
    ).toEqual(["avatarUrl", "id", "images", "name", "slug"]);
  });

  // Loaded by id, so its listing's `inTerm` / `byAuthor` must not look the
  // subject up again by the slug the query names it with.
  test.each([
    ["term", '"terms"', (ids: { term: number; author: number }) => ids.term],
    [
      "author",
      '"users"',
      (ids: { term: number; author: number }) => ids.author,
    ],
  ] as const)(
    "the %s page, by id, loads its subject once",
    async (kind, table, subjectOf) => {
      const author = await site.factory.author.create({ slug: "jo" });
      const term = await site.factory.term.create({
        taxonomy: "category",
        slug: "design",
      });
      const entry = await site.factory.entry.create({
        type: "post",
        status: "published",
        publishedAt: new Date("2026-03-04T00:00:00.000Z"),
        authorId: author.id,
      });
      await site.factory.entryTerm.create({
        entryId: entry.id,
        termId: term.id,
      });
      const ctx = site.context;

      const page = await requestStore.run(ctx, async () =>
        resolveListingPage(ctx, {
          kind,
          id: subjectOf({ term: term.id, author: author.id }),
        }),
      );

      expect(page?.data.pagination.total).toBe(1);
      const reads = sqlOf(ctx).filter((sql) => sql.includes(`from ${table}`));
      expect(reads).toHaveLength(1);
    },
  );

  test("a nested term's page by id loads the term once", async () => {
    const { factory } = regionSite;
    const author = await factory.author.create();
    const europe = await factory.term.create({
      taxonomy: "region",
      slug: "europe",
    });
    const france = await factory.term.create({
      taxonomy: "region",
      slug: "france",
      parentId: europe.id,
    });
    const entry = await factory.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date("2026-03-04T00:00:00.000Z"),
      authorId: author.id,
    });
    await factory.entryTerm.create({ entryId: entry.id, termId: france.id });
    const ctx = regionSite.context;

    const page = await requestStore.run(ctx, async () =>
      resolveListingPage(ctx, { kind: "term", id: france.id }),
    );

    expect(page?.data.pagination.total).toBe(1);
    const bySlug = sqlOf(ctx).filter(
      (sql) => sql.includes('from "terms"') && sql.includes('"slug" = ?'),
    );
    expect(bySlug).toEqual([]);
  });

  test("has no author page for an id no user carries", async () => {
    expect(
      await resolveListingPage(site.context, { kind: "author", id: 42 }),
    ).toBeNull();
  });

  test("resolves a date archive at the granularity it was named", async () => {
    await seedPost(site, { publishedAt: new Date("2026-03-04T00:00:00.000Z") });

    const page = await resolveListingPage(site.context, {
      kind: "date",
      year: 2026,
      month: 3,
      day: null,
    });

    expect(page?.node).toEqual({
      kind: "date",
      year: 2026,
      month: 3,
      day: null,
    });
    expect(page?.title).toBe("2026-03");
    expect(page?.data.pagination.total).toBe(1);
  });

  test("has no date archive for a date that does not exist", async () => {
    expect(
      await resolveListingPage(site.context, {
        kind: "date",
        year: 2026,
        month: 13,
        day: null,
      }),
    ).toBeNull();
  });

  test("has no date archive for a period with no entries", async () => {
    await seedPost(site, { publishedAt: new Date("2026-03-04T00:00:00.000Z") });

    expect(
      await resolveListingPage(site.context, {
        kind: "date",
        year: 2026,
        month: 4,
        day: null,
      }),
    ).toBeNull();
  });

  test("resolves the first page, whatever the archive's length", async () => {
    await seedPost(site);

    const page = await resolveListingPage(site.context, {
      kind: "entryType",
      entryType: "post",
    });

    expect(page?.data.pagination.page).toBe(1);
  });

  test("an author archive resolves its subject's images without a second hydration", async () => {
    const { factory } = portraitSite;
    const photo = await factory.entry.create({
      type: "post",
      status: "published",
      authorId: (await factory.user.create({})).id,
    });
    const author = await factory.user.create({
      meta: { portrait: String(photo.id) },
    });
    await factory.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date("2026-03-04T00:00:00.000Z"),
      authorId: author.id,
    });
    const ctx = portraitSite.context;

    const page = await requestStore.run(ctx, async () =>
      resolveListingPage(ctx, { kind: "author", id: author.id }),
    );
    if (page?.data.kind !== "author")
      throw new Error("expected an author page");

    expect(page.data.author.images.featured).toEqual({
      url: photoUrl(photo.id),
      alt: null,
    });
    // Listing the author's own entries replays the author from the request
    // memo rather than hydrating the portrait again.
    expect(sqlOf(ctx)).toHaveLength(5);
  });

  test("a term archive carries the term's images by role", async () => {
    const photoId = await seedPost(termArtSite, { title: "Banner" });
    const term = await termArtSite.factory.term.create({
      taxonomy: "category",
      name: "Design",
      slug: "design",
      meta: { banner: String(photoId) },
    });

    const page = await resolveListingPage(termArtSite.context, {
      kind: "term",
      id: term.id,
    });
    if (page?.data.kind !== "term") throw new Error("expected a term page");

    expect(page.data.term.images.featured).toEqual({
      url: photoUrl(photoId),
      alt: null,
    });
  });
});

describe("ListingPageTarget", () => {
  test("names its pages with the resolved-node kinds", () => {
    expectTypeOf<ListingPageTarget["kind"]>().toExtend<ResolvedNode["kind"]>();
  });
});
