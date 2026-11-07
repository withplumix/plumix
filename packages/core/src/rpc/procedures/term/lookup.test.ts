import { describe, expect, test } from "vitest";

import type { AppContext } from "../../../context/app-context.js";
import { requestStore } from "../../../context/stores.js";
import { definePlugin } from "../../../plugin/define.js";
import { testSite } from "../../../test/site.js";
import { termLookupAdapter } from "./lookup.js";

const taxonomies = definePlugin("taxonomies", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerTermTaxonomy("category", { label: "Categories" });
    ctx.registerTermTaxonomy("tag", { label: "Tags" });
    ctx.registerTermTaxonomy("region", {
      label: "Regions",
      entryTypes: ["post"],
      isHierarchical: true,
    });
  },
});

const site = await testSite({ plugins: [taxonomies] });

const CATEGORY = { termTaxonomies: ["category"] } as const;
const TAG = { termTaxonomies: ["tag"] } as const;
const REGION = { termTaxonomies: ["region"] } as const;

async function existsViaList(
  id: string,
  scope: { termTaxonomies: readonly string[] },
): Promise<boolean> {
  const rows = await termLookupAdapter.list(site.context, {
    ids: [id],
    scope,
    limit: 1,
  });
  return rows.some((row) => row.id === id);
}

/** A region under its own parent, so a per-row ancestor walk adds a query. */
async function nestedRegion(n: string): Promise<string> {
  const parent = await site.factory.term.create({
    taxonomy: "region",
    slug: `parent-${n}`,
    name: "Parent",
  });
  const child = await site.factory.term.create({
    taxonomy: "region",
    slug: `child-${n}`,
    name: "Child",
    parentId: parent.id,
  });
  return String(child.id);
}

/** Runs `lookup` inside a request, counting the queries it sends. */
async function counted<T>(
  lookup: (ctx: AppContext) => Promise<T>,
): Promise<{ readonly result: T; readonly queries: number }> {
  const ctx = site.context;
  const result = await requestStore.run(ctx, () => lookup(ctx));
  const queries = ctx.telemetry
    .getSpans()
    .filter((span) => span.name.startsWith("db:")).length;
  return { result, queries };
}

describe("termLookupAdapter", () => {
  test("list({ ids }) returns a row for a real term in the matching scope", async () => {
    const t = await site.factory.term.create();

    expect(await existsViaList(String(t.id), CATEGORY)).toBe(true);
  });

  test("list({ ids }) returns nothing for a non-existent id", async () => {
    expect(await existsViaList("999999", CATEGORY)).toBe(false);
  });

  test.each(["", "abc", "0", "-1"])(
    "list({ ids }) drops the malformed id %j before querying",
    async (id) => {
      expect(await existsViaList(id, CATEGORY)).toBe(false);
    },
  );

  test("list({ ids }) leaves out a term outside the termTaxonomies scope", async () => {
    const cat = await site.factory.category.create();

    expect(await existsViaList(String(cat.id), TAG)).toBe(false);
  });

  test("list({ ids }) finds a term inside the termTaxonomies scope", async () => {
    const cat = await site.factory.category.create();

    expect(await existsViaList(String(cat.id), CATEGORY)).toBe(true);
  });

  test("list({ ids }) batches multiple ids in one query", async () => {
    const a = await site.factory.category.create();
    const b = await site.factory.category.create();

    const rows = await termLookupAdapter.list(site.context, {
      ids: [String(a.id), String(b.id), "999999"],
      scope: CATEGORY,
      limit: 3,
    });

    expect(rows.map((r) => r.id).sort()).toEqual(
      [String(a.id), String(b.id)].sort(),
    );
  });

  test("rejects a call without scope (would otherwise expose every taxonomy)", async () => {
    await expect(termLookupAdapter.list(site.context, {})).rejects.toThrow(
      /termTaxonomies is required/,
    );
  });

  test("rejects an ids call without scope", async () => {
    await expect(
      termLookupAdapter.list(site.context, { ids: ["1"] }),
    ).rejects.toThrow(/termTaxonomies is required/);
  });

  test("rejects calls with an empty termTaxonomies array (same disclosure shape)", async () => {
    await expect(
      termLookupAdapter.list(site.context, { scope: { termTaxonomies: [] } }),
    ).rejects.toThrow(/termTaxonomies is required/);
  });

  test("list() searches by name", async () => {
    await site.factory.term.create({ name: "JavaScript", slug: "js-lang" });
    await site.factory.term.create({ name: "Python", slug: "python-lang" });

    const matches = await termLookupAdapter.list(site.context, {
      query: "javascript",
      scope: CATEGORY,
    });

    expect(matches.map((r) => r.label)).toEqual(["JavaScript"]);
  });

  test("list() searches by slug", async () => {
    await site.factory.term.create({ name: "JavaScript", slug: "js-lang" });
    await site.factory.term.create({ name: "Python", slug: "python-lang" });

    const matches = await termLookupAdapter.list(site.context, {
      query: "python-lang",
      scope: CATEGORY,
    });

    expect(matches.map((r) => r.label)).toEqual(["Python"]);
  });

  test("list() returns no more rows than the limit asks for", async () => {
    await site.factory.term.createList(5);

    const rows = await termLookupAdapter.list(site.context, {
      limit: 2,
      scope: CATEGORY,
    });

    expect(rows).toHaveLength(2);
  });

  test("list() clamps a pathological limit to the default of 20", async () => {
    await site.factory.term.createList(21);

    const rows = await termLookupAdapter.list(site.context, {
      limit: 0,
      scope: CATEGORY,
    });

    expect(rows).toHaveLength(20);
  });

  test("list() narrows to the declared taxonomies", async () => {
    await site.factory.category.create({ name: "Engineering" });
    await site.factory.tag.create({ name: "Hot Take" });

    const cats = await termLookupAdapter.list(site.context, {
      scope: CATEGORY,
    });

    expect(cats.map((r) => r.label)).toEqual(["Engineering"]);
  });

  test("list() returns subtitle including taxonomy + slug", async () => {
    await site.factory.category.create({ name: "Sub Test", slug: "sub-test" });

    const [row] = await termLookupAdapter.list(site.context, {
      query: "Sub Test",
      scope: CATEGORY,
    });

    expect(row?.subtitle).toBe("category · sub-test");
  });

  test("list({ ids }) returns full lookup result (targetType) for a valid in-scope id", async () => {
    // The single-reference picker resolves its selected id through this
    // same `list({ ids })` path, so this pins the row's wire contract.
    const t = await site.factory.category.create({ name: "Resolved" });

    const [result] = await termLookupAdapter.list(site.context, {
      ids: [String(t.id)],
      scope: CATEGORY,
      limit: 1,
    });

    expect(result?.id).toBe(String(t.id));
    expect(result?.label).toBe("Resolved");
    // Every term row carries `targetType` (the taxonomy name) so the admin
    // picker can cascade through the taxonomy's per-type labels.
    expect(result?.targetType).toBe("category");
  });

  test("hydrate() resolves ids into term summaries with archive urls", async () => {
    const t = await site.factory.category.create({
      name: "Guides",
      slug: "guides",
    });

    const rows = await termLookupAdapter.hydrate(site.context, {
      ids: [String(t.id)],
      scope: CATEGORY,
    });

    expect(rows).toEqual([
      {
        id: String(t.id),
        taxonomy: "category",
        name: "Guides",
        slug: "guides",
        url: "/category/guides",
      },
    ]);
  });

  test("hydrate() omits missing and out-of-scope ids", async () => {
    const category = await site.factory.category.create();
    const tag = await site.factory.tag.create();

    const rows = await termLookupAdapter.hydrate(site.context, {
      ids: [String(category.id), String(tag.id), "999999", "abc"],
      scope: CATEGORY,
    });

    expect(rows.map((row) => row.id)).toEqual([String(category.id)]);
  });

  test("hydrate() over nested terms costs the same queries however many it holds", async () => {
    const first = await nestedRegion("0");
    const one = await counted((ctx) =>
      termLookupAdapter.hydrate(ctx, { ids: [first], scope: REGION }),
    );
    const ids = [
      first,
      await nestedRegion("1"),
      await nestedRegion("2"),
      await nestedRegion("3"),
    ];

    const four = await counted((ctx) =>
      termLookupAdapter.hydrate(ctx, { ids, scope: REGION }),
    );

    expect(four.result.map((row) => row.url)).toEqual([
      "/region/parent-0/child-0",
      "/region/parent-1/child-1",
      "/region/parent-2/child-2",
      "/region/parent-3/child-3",
    ]);
    expect(one.queries).toBeGreaterThan(0);
    expect(four.queries).toBe(one.queries);
  });

  test("list({ ids }) over nested terms costs the same queries however many it holds", async () => {
    const first = await nestedRegion("0");
    const one = await counted((ctx) =>
      termLookupAdapter.list(ctx, { ids: [first], scope: REGION, limit: 1 }),
    );
    const ids = [
      first,
      await nestedRegion("1"),
      await nestedRegion("2"),
      await nestedRegion("3"),
    ];

    const four = await counted((ctx) =>
      termLookupAdapter.list(ctx, { ids, scope: REGION, limit: 4 }),
    );

    expect(four.result.map((row) => row.href)).toEqual([
      "/region/parent-0/child-0",
      "/region/parent-1/child-1",
      "/region/parent-2/child-2",
      "/region/parent-3/child-3",
    ]);
    expect(one.queries).toBeGreaterThan(0);
    expect(four.queries).toBe(one.queries);
  });
});
