import { beforeAll, describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { EntryQuery } from "./query.js";
import { asc, eq, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { createTestContext } from "../test/context.js";
import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { compileEntryQuery, entryQuery } from "./query.js";

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
