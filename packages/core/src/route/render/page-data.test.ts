import { describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app.js";
import type { DispatcherHarness } from "../../test/dispatcher.js";
import { definePlugin } from "../../plugin/define.js";
import { date } from "../../plugin/fields/temporal.js";
import { createTestContext } from "../../test/context.js";
import { createDispatcherHarness } from "../../test/dispatcher.js";
import {
  photoField,
  photoLookupAdapter,
  photoProfilePlugin,
  photoUrl,
} from "../../test/photo-lookup.js";
import { createTracedContext } from "../../test/traced-context.js";
import { resolveListingPage } from "./page-data.js";
import { forTermTaxonomy } from "./template-builders.js";
import { resolveTemplate } from "./template-hierarchy.js";

// Declared with `.returns("date")` so the term decode pass is visible in what
// the archive carries: `meta` holds the `Date`, `storedMeta` the ISO string.
const _categoryDateFields = [date("launchedOn").returns("date")];
declare module "../../plugin/fields/contributions.js" {
  interface TermMetaContributions {
    categoryDates: {
      termTaxonomies: "category";
      fields: typeof _categoryDateFields;
    };
  }
}

const blog = definePlugin("blog", (ctx) => {
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
});

// Gives a category term a `featured` role field, so the term archive has an
// image to project.
const termArt = definePlugin("term-art", (ctx) => {
  ctx.registerLookupAdapter({ kind: "photo", adapter: photoLookupAdapter });
  ctx.registerTermMetaBox("categoryArt", {
    label: "Art",
    termTaxonomies: ["category"],
    fields: [photoField("banner", { role: "featured" })],
  });
});

async function harness(): Promise<DispatcherHarness> {
  return createDispatcherHarness({ plugins: [blog] });
}

function contextFor(h: DispatcherHarness): AppContext {
  return createTestContext({
    db: h.db,
    hooks: h.app.hooks,
    plugins: h.app.plugins,
  });
}

async function seedPost(
  h: DispatcherHarness,
  overrides: { title?: string; publishedAt?: Date } = {},
): Promise<number> {
  const author = await h.seedUser("admin");
  const entry = await h.factory.entry.create({
    type: "post",
    title: overrides.title ?? "Hello",
    status: "published",
    publishedAt: overrides.publishedAt ?? new Date("2026-03-04T00:00:00.000Z"),
    authorId: author.id,
  });
  return entry.id;
}

describe("resolveListingPage", () => {
  test("resolves the front page with the entries it lists", async () => {
    const h = await harness();
    await seedPost(h, { title: "Front matter" });

    const page = await resolveListingPage(contextFor(h), {
      kind: "front-page",
    });

    expect(page?.node).toEqual({ kind: "front-page" });
    expect(page?.data.kind).toBe("frontPage");
    expect(page?.data.pagination.total).toBe(1);
  });

  test("hands archive:entries the params the page's URL would capture", async () => {
    const seen: Record<string, string>[] = [];
    const recording = definePlugin("recording", (ctx) => {
      ctx.addFilter("archive:entries", (query, archive, params) => {
        seen.push(params);
        return archive.kind === "date" ? query.none() : query;
      });
    });
    const h = await createDispatcherHarness({ plugins: [blog, recording] });
    await seedPost(h);

    const page = await resolveListingPage(contextFor(h), {
      kind: "date",
      year: 2026,
      month: 3,
      day: null,
    });

    expect(page?.data.pagination.total).toBe(0);
    expect(seen).toEqual([{ year: "2026", month: "03" }]);
  });

  test("resolves a content-type archive and names it with its label", async () => {
    const h = await harness();
    await seedPost(h);

    const page = await resolveListingPage(contextFor(h), {
      kind: "archive",
      entryType: "post",
    });

    expect(page?.node).toEqual({
      kind: "content-type-archive",
      entryType: "post",
    });
    expect(page?.title).toBe("Posts");
  });

  test("has no archive page for a type that was registered without one", async () => {
    const h = await harness();

    expect(
      await resolveListingPage(contextFor(h), {
        kind: "archive",
        entryType: "note",
      }),
    ).toBeNull();
  });

  test("has no archive page for a private type", async () => {
    const h = await harness();

    expect(
      await resolveListingPage(contextFor(h), {
        kind: "archive",
        entryType: "secret",
      }),
    ).toBeNull();
  });

  test("resolves a term by id, with the entries filed under it", async () => {
    const h = await harness();
    const entryId = await seedPost(h);
    const term = await h.factory.term.create({
      taxonomy: "category",
      name: "Design",
      slug: "design",
    });
    await h.factory.entryTerm.create({ entryId, termId: term.id });

    const page = await resolveListingPage(contextFor(h), {
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

  // A term archive gets the same decode pass an entry does, so `term.meta`
  // and `term.storedMeta` diverge here — which is why `termMetaEquals` reads
  // `storedMeta`: a `Date` is not a value `===` can match a rule literal on.
  test("a term archive is decoded, and a whereMeta rule still matches its stored meta", async () => {
    const h = await harness();
    const term = await h.factory.term.create({
      taxonomy: "category",
      name: "Design",
      slug: "design",
      meta: { launchedOn: "2026-01-01" },
    });

    const page = await resolveListingPage(contextFor(h), {
      kind: "term",
      id: term.id,
    });
    if (page?.data.kind !== "taxonomy") throw new Error("expected a term page");

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
    const h = await harness();
    const term = await h.factory.term.create({
      taxonomy: "mood",
      name: "Wistful",
      slug: "wistful",
    });

    expect(
      await resolveListingPage(contextFor(h), {
        kind: "term",
        id: term.id,
      }),
    ).toBeNull();
  });

  test("has no term page for an id no term carries", async () => {
    const h = await harness();

    expect(
      await resolveListingPage(contextFor(h), { kind: "term", id: 9999 }),
    ).toBeNull();
  });

  test("resolves an author by id without leaking the user row", async () => {
    const h = await harness();
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      title: "Bylined",
      status: "published",
      publishedAt: new Date("2026-03-04T00:00:00.000Z"),
      authorId: author.id,
    });

    const page = await resolveListingPage(contextFor(h), {
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
    ["term", '"terms"'],
    ["author", '"users"'],
  ] as const)(
    "the %s page, by id, loads its subject once",
    async (kind, table) => {
      const traced = await createTracedContext({ plugins: [blog] });
      const author = await traced.harness.factory.author.create({ slug: "jo" });
      const term = await traced.harness.factory.term.create({
        taxonomy: "category",
        slug: "design",
      });
      const entry = await traced.harness.factory.entry.create({
        type: "post",
        status: "published",
        publishedAt: new Date("2026-03-04T00:00:00.000Z"),
        authorId: author.id,
      });
      await traced.harness.factory.entryTerm.create({
        entryId: entry.id,
        termId: term.id,
      });

      const page = await traced.run(() =>
        resolveListingPage(traced.ctx, {
          kind,
          id: kind === "term" ? term.id : author.id,
        }),
      );

      expect(page?.data.pagination.total).toBe(1);
      const reads = traced
        .dbSpans()
        .map((span) => span.attributes["db.sql"])
        .filter((sql) => typeof sql === "string")
        .filter((sql) => sql.includes(`from ${table}`));
      expect(reads).toHaveLength(1);
    },
  );

  test("a nested term's page by id loads the term once", async () => {
    const regions = definePlugin("regions", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerTermTaxonomy("region", {
        label: "Regions",
        entryTypes: ["post"],
        isHierarchical: true,
      });
    });
    const traced = await createTracedContext({ plugins: [regions] });
    const { factory } = traced.harness;
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

    const page = await traced.run(() =>
      resolveListingPage(traced.ctx, { kind: "term", id: france.id }),
    );

    expect(page?.data.pagination.total).toBe(1);
    const bySlug = traced
      .dbSpans()
      .map((span) => span.attributes["db.sql"])
      .filter((sql) => typeof sql === "string")
      .filter(
        (sql) => sql.includes('from "terms"') && sql.includes('"slug" = ?'),
      );
    expect(bySlug).toEqual([]);
  });

  test("has no author page for an id no user carries", async () => {
    const h = await harness();

    expect(
      await resolveListingPage(contextFor(h), { kind: "author", id: 42 }),
    ).toBeNull();
  });

  test("resolves a date archive at the granularity it was named", async () => {
    const h = await harness();
    await seedPost(h, { publishedAt: new Date("2026-03-04T00:00:00.000Z") });

    const page = await resolveListingPage(contextFor(h), {
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
    const h = await harness();

    expect(
      await resolveListingPage(contextFor(h), {
        kind: "date",
        year: 2026,
        month: 13,
        day: null,
      }),
    ).toBeNull();
  });

  test("resolves the first page, whatever the archive's length", async () => {
    const h = await harness();
    await seedPost(h);

    const page = await resolveListingPage(contextFor(h), {
      kind: "archive",
      entryType: "post",
    });

    expect(page?.data.pagination.page).toBe(1);
  });

  test("an author archive resolves its subject's images without a second hydration", async () => {
    const traced = await createTracedContext({
      plugins: [blog, photoProfilePlugin],
    });
    const { harness } = traced;
    const photo = await harness.factory.entry.create({
      type: "post",
      status: "published",
      authorId: (await harness.factory.user.create({})).id,
    });
    const author = await harness.factory.user.create({
      meta: { portrait: String(photo.id) },
    });
    await harness.factory.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date("2026-03-04T00:00:00.000Z"),
      authorId: author.id,
    });

    const page = await traced.run(() =>
      resolveListingPage(traced.ctx, { kind: "author", id: author.id }),
    );
    if (page?.data.kind !== "author")
      throw new Error("expected an author page");

    expect(page.data.author.images.featured).toEqual({
      url: photoUrl(photo.id),
      alt: null,
    });
    // The subject's row, its portrait, the entry count and page, and the
    // entry_term join. Listing the author's own entries replays the author
    // from the request memo rather than hydrating the portrait again.
    expect(traced.dbQueryCount()).toBe(5);
  });

  test("a term archive carries the term's images by role", async () => {
    const h = await createDispatcherHarness({ plugins: [blog, termArt] });
    const photoId = await seedPost(h, { title: "Banner" });
    const term = await h.factory.term.create({
      taxonomy: "category",
      name: "Design",
      slug: "design",
      meta: { banner: String(photoId) },
    });

    const page = await resolveListingPage(contextFor(h), {
      kind: "term",
      id: term.id,
    });
    if (page?.data.kind !== "taxonomy") throw new Error("expected a term page");

    expect(page.data.term.images.featured).toEqual({
      url: photoUrl(photoId),
      alt: null,
    });
  });
});
