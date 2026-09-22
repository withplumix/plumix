import { beforeEach, describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app.js";
import type { EntryQuery } from "../../entries/query.js";
import type { DispatcherHarness } from "../../test/dispatcher.js";
import type { EntryPage } from "./entry-listing.js";
import { entryQuery } from "../../entries/query.js";
import { definePlugin } from "../../plugin/define.js";
import { createTestContext } from "../../test/context.js";
import { createDispatcherHarness } from "../../test/dispatcher.js";
import { createTracedContext } from "../../test/traced-context.js";
import { listEntryPage } from "./entry-listing.js";

const blog = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  ctx.registerEntryType("secret", { label: "Secrets", isPublic: false });
});

let h: DispatcherHarness;
let ctx: AppContext;
let authorId: number;

beforeEach(async () => {
  h = await createDispatcherHarness({ plugins: [blog] });
  ctx = createTestContext({
    db: h.db,
    hooks: h.app.hooks,
    plugins: h.app.plugins,
  });
  authorId = (await h.seedUser("admin")).id;
});

async function seed(
  overrides: Partial<Parameters<typeof h.factory.entry.create>[0]> = {},
): Promise<void> {
  await h.factory.entry.create({
    type: "post",
    status: "published",
    publishedAt: new Date("2026-03-04T00:00:00.000Z"),
    authorId,
    ...overrides,
  });
}

/** The listing a query gives, failing the test where it gives none. */
async function listing(
  query: EntryQuery,
  page = 1,
  perPage = 20,
): Promise<EntryPage> {
  const listed = await listEntryPage(ctx, query, { page, perPage });
  if (listed === null) throw new Error("query did not resolve");
  return listed;
}

/** The slugs a listing carries, in the order it lists them. */
function slugs(listed: EntryPage): string[] {
  return listed.entries.map((entry) => entry.slug);
}

describe("listEntryPage", () => {
  test("lists only public entries, whatever the query was built from", async () => {
    await seed({ slug: "live" });
    await seed({ slug: "a-draft", status: "draft", publishedAt: null });
    await seed({ slug: "binned", status: "trash" });
    await seed({
      slug: "queued",
      status: "scheduled",
      publishedAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    await seed({ slug: "hidden", type: "secret" });

    // Built from scratch rather than narrowed: the reader adds the rule
    // itself, so a query that never saw it still lists nothing else.
    expect(slugs(await listing(entryQuery()))).toEqual(["live"]);
  });

  test("a scheduled entry whose time has passed still needs publishing", async () => {
    // `status` is the fact, not the date: the scheduler flips the row.
    await seed({
      slug: "overdue",
      status: "scheduled",
      publishedAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    expect(slugs(await listing(entryQuery()))).toEqual([]);
  });
});

describe("listEntryPage paging", () => {
  beforeEach(async () => {
    for (const [slug, day, title] of [
      ["first", "01", "Gamma"],
      ["second", "02", "Alpha"],
      ["third", "03", "Beta"],
    ] as const) {
      await seed({
        slug,
        title,
        publishedAt: new Date(`2026-03-${day}T00:00:00Z`),
      });
    }
  });

  test("pages the query and counts every matching entry", async () => {
    const one = await listing(entryQuery(), 1, 2);
    expect(slugs(one)).toEqual(["third", "second"]);
    expect(one.pagination).toEqual({
      page: 1,
      perPage: 2,
      total: 3,
      pageCount: 2,
    });

    const two = await listing(entryQuery(), 2, 2);
    expect(slugs(two)).toEqual(["first"]);
    expect(two.outOfRange).toBe(false);
  });

  test("reads the page in the order the query carries", async () => {
    expect(slugs(await listing(entryQuery().oldest(), 1, 2))).toEqual([
      "first",
      "second",
    ]);
    expect(slugs(await listing(entryQuery().orderBy("title")))).toEqual([
      "second",
      "third",
      "first",
    ]);
  });

  test("the page after the last one is out of range, not empty", async () => {
    expect((await listing(entryQuery(), 3, 2)).outOfRange).toBe(true);
  });

  test("an archive with nothing in it is an empty first page, not out of range", async () => {
    const empty = await listing(entryQuery().none(), 1, 2);
    expect(empty.outOfRange).toBe(false);
    expect(empty.entries).toEqual([]);
  });

  test("a query that cannot resolve has no listing to give", async () => {
    const unresolvable = entryQuery().inTerm("category", ["nothing-is-here"]);
    expect(
      await listEntryPage(ctx, unresolvable, { page: 1, perPage: 2 }),
    ).toBe(null);
  });

  test("a tie is broken by id, so no entry straddles a page boundary", async () => {
    // Four entries sharing one publish date: with only the date to sort on,
    // SQLite is free to return them in any order, and a row could land on
    // both pages or on neither.
    const shared = new Date("2026-04-01T00:00:00Z");
    for (const slug of ["w", "x", "y", "z"]) {
      await seed({ slug, publishedAt: shared });
    }
    const pages = await Promise.all(
      [1, 2, 3, 4].map(async (page) =>
        slugs(await listing(entryQuery(), page, 2)),
      ),
    );
    expect(pages.flat()).toEqual([
      "z",
      "y",
      "x",
      "w",
      "third",
      "second",
      "first",
    ]);
  });

  test("a listing costs a fixed number of queries whatever the page holds", async () => {
    // Counted from the driver's own spans rather than from a spy on the
    // reader: an N+1 is a thing the database sees. Each page size gets its own
    // cold context, because a warm request memo would answer for an author the
    // earlier read had already batched and undercount the later one.
    const cost = async (perPage: number): Promise<number> => {
      const traced = await createTracedContext({ plugins: [blog] });
      // Two authors, so the larger page's author batch covers more than one
      // and a per-row lookup would show up as a bigger number here.
      for (const role of ["admin", "editor", "admin"] as const) {
        await traced.harness.factory.entry.create({
          type: "post",
          status: "published",
          publishedAt: new Date("2026-03-04T00:00:00.000Z"),
          authorId: (await traced.harness.seedUser(role)).id,
        });
      }
      const before = traced.dbQueryCount();
      await traced.run(async () => {
        await listEntryPage(traced.ctx, entryQuery(), { page: 1, perPage });
      });
      return traced.dbQueryCount() - before;
    };

    // Count, page, the authors of the page, the terms of the page.
    expect(await cost(1)).toBe(4);
    expect(await cost(20)).toBe(4);
  });
});
