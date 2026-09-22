import { beforeAll, describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { EntryQuery } from "./query.js";
import { asc, eq, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { createTestContext } from "../test/context.js";
import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { EntryQueryError } from "./errors.js";
import {
  compileEntryQuery,
  entryQuery,
  entryQueryOrder,
  entryQueryTypeNames,
} from "./query.js";

let ctx: AppContext;
let subtreeRootId: number;

// One seed for every narrowing: three types, two authors, a nested term
// attached to one entry, and a parent with a child and a grandchild.
beforeAll(async () => {
  const db = await createTestDb();
  const factory = factoriesFor(db);
  const author = await factory.admin.create();
  for (const [type, slug] of [
    ["post", "a-post"],
    ["page", "a-page"],
    ["event", "an-event"],
  ] as const) {
    await factory.entry.create({ type, slug, authorId: author.id });
  }

  const parent = await factory.category.create({ slug: "sport" });
  const child = await factory.category.create({
    slug: "tennis",
    parentId: parent.id,
  });
  const tagged = await factory.entry.create({
    type: "post",
    slug: "tagged",
    authorId: author.id,
  });
  await factory.entryTerm.create({ entryId: tagged.id, termId: child.id });

  const other = await factory.user.create({
    email: "other@example.com",
    slug: "other",
  });
  await factory.entry.create({
    type: "post",
    slug: "by-other",
    authorId: other.id,
    publishedAt: new Date("2024-03-15T12:00:00Z"),
  });

  const root = await factory.entry.create({
    type: "page",
    slug: "root",
    authorId: author.id,
  });
  const branch = await factory.entry.create({
    type: "page",
    slug: "branch",
    authorId: author.id,
    parentId: root.id,
  });
  await factory.entry.create({
    type: "page",
    slug: "leaf",
    authorId: author.id,
    parentId: branch.id,
  });
  subtreeRootId = root.id;

  ctx = createTestContext({ db });
});

/** The slugs a compiled query selects, or null where it cannot resolve. */
async function selected(query: EntryQuery): Promise<readonly string[] | null> {
  const condition = await compileEntryQuery(ctx, query);
  if (condition === null) return null;
  const rows = await ctx.db
    .select({ slug: entries.slug })
    .from(entries)
    .where(condition)
    .orderBy(asc(entries.id));
  return rows.map((row) => row.slug);
}

describe("entryQuery", () => {
  test("an untouched query constrains nothing", async () => {
    const every = await ctx.db
      .select({ slug: entries.slug })
      .from(entries)
      .orderBy(asc(entries.id));
    expect(await selected(entryQuery())).toEqual(every.map((row) => row.slug));
  });

  test("ofTypes narrows to the named types", async () => {
    expect(await selected(entryQuery().ofTypes("post", "event"))).toEqual([
      "a-post",
      "an-event",
      "tagged",
      "by-other",
    ]);
  });

  test("two ofTypes narrowings intersect rather than widen", async () => {
    expect(
      await selected(entryQuery().ofTypes("post", "page").ofTypes("page")),
    ).toEqual(["a-page", "root", "branch", "leaf"]);
    expect(
      await selected(entryQuery().ofTypes("post").ofTypes("event")),
    ).toEqual([]);
  });

  test("where ANDs an arbitrary predicate on", async () => {
    expect(
      await selected(entryQuery().where(eq(entries.slug, "a-page"))),
    ).toEqual(["a-page"]);
  });

  test("a where condition cannot widen the query around it", async () => {
    // `and` parenthesizes the conjunction but not its operands, so a top-level
    // `OR` inside one condition would otherwise bind looser than the `AND`
    // joining it to the rest and admit rows every other narrowing excluded.
    const widening = sql`${entries.type} = 'event' OR 1 = 1`;
    expect(
      await selected(entryQuery().ofTypes("page").where(widening)),
    ).toEqual(["a-page", "root", "branch", "leaf"]);
  });

  test("none selects nothing, and is not the same answer as unresolvable", async () => {
    expect(await selected(entryQuery().none())).toEqual([]);
    expect(await selected(entryQuery().ofTypes("post").none())).toEqual([]);
  });

  test("inTerm narrows to the entries attached to a nested term path", async () => {
    expect(
      await selected(entryQuery().inTerm("category", ["sport", "tennis"])),
    ).toEqual(["tagged"]);
  });

  test("inTerm cannot resolve an unknown path, so the query has no answer", async () => {
    expect(
      await selected(entryQuery().inTerm("category", ["missing"])),
    ).toBeNull();
    expect(
      await selected(entryQuery().inTerm("category", ["tennis", "sport"])),
    ).toBeNull();
    expect(await selected(entryQuery().inTerm("tag", ["tennis"]))).toBeNull();
  });

  test("byAuthor narrows to one user's entries by slug", async () => {
    expect(await selected(entryQuery().byAuthor("other"))).toEqual([
      "by-other",
    ]);
  });

  test("byAuthor cannot resolve an unknown slug", async () => {
    expect(await selected(entryQuery().byAuthor("nobody"))).toBeNull();
  });

  test("inDateRange narrows to entries published in the period", async () => {
    expect(await selected(entryQuery().inDateRange(2024, 3, 15))).toEqual([
      "by-other",
    ]);
    expect(await selected(entryQuery().inDateRange(2024, 3, null))).toEqual([
      "by-other",
    ]);
    expect(await selected(entryQuery().inDateRange(2023, null, null))).toEqual(
      [],
    );
  });

  test("inDateRange cannot resolve a date that does not exist", async () => {
    expect(await selected(entryQuery().inDateRange(2024, 2, 30))).toBeNull();
    expect(await selected(entryQuery().inDateRange(2024, 13, null))).toBeNull();
  });

  test("under narrows to a parent's whole subtree, not just its children", async () => {
    expect(await selected(entryQuery().under(subtreeRootId))).toEqual([
      "branch",
      "leaf",
    ]);
  });

  test("under terminates on a cycle in the parent chain", async () => {
    // `entries.parentId` has no constraint against a cycle and `plumix/db` is a
    // documented direct-write surface, so a pair of rows pointing at each other
    // is reachable. A recursive walk that never ends is a CPU kill on every
    // request that compiles this narrowing.
    const cyclic = await createTestDb();
    const factory = factoriesFor(cyclic);
    const author = await factory.admin.create();
    const a = await factory.entry.create({ slug: "a", authorId: author.id });
    const b = await factory.entry.create({
      slug: "b",
      authorId: author.id,
      parentId: a.id,
    });
    await cyclic
      .update(entries)
      .set({ parentId: b.id })
      .where(eq(entries.id, a.id));

    const cyclicCtx = createTestContext({ db: cyclic });
    const condition = await compileEntryQuery(
      cyclicCtx,
      entryQuery().under(a.id),
    );
    if (condition === null) throw new Error("expected a condition");
    const rows = await cyclicCtx.db
      .select({ slug: entries.slug })
      .from(entries)
      .where(condition);
    expect(rows.map((row) => row.slug).sort()).toEqual(["a", "b"]);
  });

  test("a query nobody built cannot be compiled, so narrowings cannot be forged", async () => {
    // The narrowings are not on the query, so there is no `{ ...given,
    // narrowings: [] }` that drops what a surface handed out. A structural
    // copy carries the methods and satisfies the type, and is still not a
    // query anyone built.
    const forged: EntryQuery = { ...entryQuery().ofTypes("page") };
    await expect(compileEntryQuery(ctx, forged)).rejects.toThrow(/entryQuery/);
  });

  test("a query cannot be edited after it is handed out", () => {
    const query = entryQuery().ofTypes("page");
    expect(() => {
      // Safety: the point of the assertion is that the cast is the only way to
      // attempt this, and that it fails anyway.
      (query as { ofTypes: unknown }).ofTypes = () => entryQuery();
    }).toThrow(TypeError);
  });

  test("ofTypes with no names narrows to nothing rather than to everything", async () => {
    // A surface doing `ofTypes(...allowed)` over an empty roster must not get
    // an unconstrained query out of it. Pinned because the answer comes from
    // drizzle's handling of an empty `inArray`, not from code here.
    expect(await selected(entryQuery().ofTypes())).toEqual([]);
  });

  test("an unresolvable narrowing outranks none, whichever order they arrive in", async () => {
    // The two answers a route surface tells apart: 404 and an empty page. A
    // query that names a term nothing answers to has no answer to give, and
    // saying "nothing matches" alongside it does not supply one.
    const missing = entryQuery().inTerm("category", ["missing"]);
    expect(await selected(missing.none())).toBeNull();
    expect(
      await selected(entryQuery().none().inTerm("category", ["missing"])),
    ).toBeNull();
  });

  test("a narrowing returns a new query, leaving the receiver alone", async () => {
    const base = entryQuery().ofTypes("post", "page");
    base.ofTypes("page");
    expect(await selected(base)).toEqual([
      "a-post",
      "a-page",
      "tagged",
      "by-other",
      "root",
      "branch",
      "leaf",
    ]);
  });
});

describe("entryQuery ordering", () => {
  let orderCtx: AppContext;

  // Two entries share a publish date, a sort order and a title initial, so
  // every order below has a tie for the entry id to break.
  beforeAll(async () => {
    const db = await createTestDb();
    const factory = factoriesFor(db);
    const author = await factory.admin.create();
    for (const [slug, publishedAt, title, sortOrder, rank] of [
      ["alpha", "2024-01-01T00:00:00Z", "beta", 2, 2],
      ["bravo", "2024-01-02T00:00:00Z", "Alpha", 1, 1],
      ["charlie", "2024-01-02T00:00:00Z", "Gamma", 1, 3],
    ] as const) {
      await factory.entry.create({
        slug,
        title,
        sortOrder,
        authorId: author.id,
        status: "published",
        publishedAt: new Date(publishedAt),
        meta: { rank },
      });
    }
    orderCtx = createTestContext({ db });
  });

  /** The slugs a query selects, in the order it asks for. */
  async function ordered(query: EntryQuery): Promise<readonly string[]> {
    const condition = await compileEntryQuery(orderCtx, query);
    if (condition === null) throw new Error("query did not resolve");
    const rows = await orderCtx.db
      .select({ slug: entries.slug })
      .from(entries)
      .where(condition)
      .orderBy(...entryQueryOrder(query));
    return rows.map((row) => row.slug);
  }

  test("a query with no order given is newest first, id breaking ties", async () => {
    expect(await ordered(entryQuery())).toEqual(["charlie", "bravo", "alpha"]);
  });

  test("latest is the default spelled out", async () => {
    expect(await ordered(entryQuery().latest())).toEqual(
      await ordered(entryQuery()),
    );
  });

  test("oldest reverses it, and the tie-break with it", async () => {
    expect(await ordered(entryQuery().oldest())).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
  });

  test("orderBy reads a column, ascending by default", async () => {
    // "beta" is lowercase: sorted as bytes it would follow every capitalized
    // title, which is not the order a reader means by alphabetical.
    expect(await ordered(entryQuery().orderBy("title"))).toEqual([
      "bravo",
      "alpha",
      "charlie",
    ]);
    expect(await ordered(entryQuery().orderBy("title", "desc"))).toEqual([
      "charlie",
      "alpha",
      "bravo",
    ]);
  });

  test("the entry id breaks a tie in the order's own direction", async () => {
    // bravo and charlie share a sort order; ascending puts the lower id first
    // and descending the higher, so neither crosses a page boundary twice.
    expect(await ordered(entryQuery().orderBy("sortOrder"))).toEqual([
      "bravo",
      "charlie",
      "alpha",
    ]);
    expect(await ordered(entryQuery().orderBy("sortOrder", "desc"))).toEqual([
      "alpha",
      "charlie",
      "bravo",
    ]);
  });

  test("orderByMeta reads a value out of the meta column", async () => {
    expect(await ordered(entryQuery().orderByMeta("rank"))).toEqual([
      "bravo",
      "alpha",
      "charlie",
    ]);
    expect(await ordered(entryQuery().orderByMeta("rank", "desc"))).toEqual([
      "charlie",
      "alpha",
      "bravo",
    ]);
  });

  test("a later order replaces the earlier one rather than sorting under it", async () => {
    // Sorting under would keep the title order and only break its ties by
    // sort order, which for this seed is the same list. Replacing is not.
    expect(
      await ordered(entryQuery().orderBy("title").orderBy("sortOrder")),
    ).toEqual(await ordered(entryQuery().orderBy("sortOrder")));
  });

  test("ordering never changes which entries a query selects", async () => {
    const narrowed = entryQuery().ofTypes("post");
    const every = ["alpha", "bravo", "charlie"];
    expect([...(await ordered(narrowed))].sort()).toEqual(every);
    for (const query of [
      narrowed.latest(),
      narrowed.oldest(),
      narrowed.orderBy("title", "desc"),
      narrowed.orderByMeta("rank"),
      narrowed.orderByMeta("absent"),
    ]) {
      expect([...(await ordered(query))].sort()).toEqual(every);
    }
  });

  test("the types a query can list are what its ofTypes calls agree on", () => {
    // What the CDN tagging reads: a page listing only `post` is stored under
    // `t:post` alone, and one that names no type is stored under every
    // public type's tag, because a publish of any of them could change it.
    expect(entryQueryTypeNames(entryQuery())).toBeNull();
    expect(entryQueryTypeNames(entryQuery().ofTypes("post", "page"))).toEqual([
      "post",
      "page",
    ]);
    expect(
      entryQueryTypeNames(entryQuery().ofTypes("post", "page").ofTypes("page")),
    ).toEqual(["page"]);
    expect(
      entryQueryTypeNames(entryQuery().ofTypes("post").ofTypes("page")),
    ).toEqual([]);
  });

  test("a meta key with no JSON path of its own is refused where it is given", () => {
    // At the declaration, not at the render: the stack points at the archive
    // that wrote the key rather than at the page that later failed.
    expect(() => entryQuery().orderByMeta('a"b')).toThrow(EntryQueryError);
  });
});
