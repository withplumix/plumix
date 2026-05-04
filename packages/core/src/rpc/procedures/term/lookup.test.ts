import { describe, expect, test } from "vitest";

import { categoryTerm, tagTerm, termFactory } from "../../../test/factories.js";
import { createRpcHarness } from "../../../test/rpc.js";
import { termLookupAdapter } from "./lookup.js";

const CATEGORY = { termTaxonomies: ["category"] } as const;
const TAG = { termTaxonomies: ["tag"] } as const;

async function existsViaList(
  h: Awaited<ReturnType<typeof createRpcHarness>>,
  id: string,
  scope: { termTaxonomies: readonly string[] },
): Promise<boolean> {
  const rows = await termLookupAdapter.list(h.context, {
    ids: [id],
    scope,
    limit: 1,
  });
  return rows.some((row) => row.id === id);
}

describe("termLookupAdapter", () => {
  test("list({ ids }) returns a row for a real term in the matching scope", async () => {
    const h = await createRpcHarness();
    const t = await termFactory.transient({ db: h.context.db }).create();
    expect(await existsViaList(h, String(t.id), CATEGORY)).toBe(true);
  });

  test("list({ ids }) returns nothing for a non-existent id", async () => {
    const h = await createRpcHarness();
    expect(await existsViaList(h, "999999", CATEGORY)).toBe(false);
  });

  test("list({ ids }) drops malformed ids before querying", async () => {
    const h = await createRpcHarness();
    expect(await existsViaList(h, "", CATEGORY)).toBe(false);
    expect(await existsViaList(h, "abc", CATEGORY)).toBe(false);
    expect(await existsViaList(h, "0", CATEGORY)).toBe(false);
    expect(await existsViaList(h, "-1", CATEGORY)).toBe(false);
  });

  test("list({ ids }) honours the termTaxonomies scope filter", async () => {
    const h = await createRpcHarness();
    const cat = await categoryTerm.transient({ db: h.context.db }).create();
    expect(await existsViaList(h, String(cat.id), TAG)).toBe(false);
    expect(await existsViaList(h, String(cat.id), CATEGORY)).toBe(true);
  });

  test("list({ ids }) batches multiple ids in one query", async () => {
    const h = await createRpcHarness();
    const a = await categoryTerm.transient({ db: h.context.db }).create();
    const b = await categoryTerm.transient({ db: h.context.db }).create();
    const rows = await termLookupAdapter.list(h.context, {
      ids: [String(a.id), String(b.id), "999999"],
      scope: CATEGORY,
      limit: 3,
    });
    const idSet = new Set(rows.map((r) => r.id));
    expect(idSet.has(String(a.id))).toBe(true);
    expect(idSet.has(String(b.id))).toBe(true);
    expect(idSet.has("999999")).toBe(false);
  });

  test("rejects calls without scope (would otherwise expose every taxonomy)", async () => {
    const h = await createRpcHarness();
    await expect(termLookupAdapter.list(h.context, {})).rejects.toThrow(
      /termTaxonomies is required/,
    );
    await expect(
      termLookupAdapter.list(h.context, { ids: ["1"] }),
    ).rejects.toThrow(/termTaxonomies is required/);
    await expect(termLookupAdapter.resolve(h.context, "1")).rejects.toThrow(
      /termTaxonomies is required/,
    );
  });

  test("rejects calls with an empty termTaxonomies array (same disclosure shape)", async () => {
    const h = await createRpcHarness();
    await expect(
      termLookupAdapter.list(h.context, { scope: { termTaxonomies: [] } }),
    ).rejects.toThrow(/termTaxonomies is required/);
  });

  test("list() searches by name and slug", async () => {
    const h = await createRpcHarness();
    await termFactory
      .transient({ db: h.context.db })
      .create({ name: "JavaScript", slug: "js-lang" });
    await termFactory
      .transient({ db: h.context.db })
      .create({ name: "Python", slug: "python-lang" });

    const matches = await termLookupAdapter.list(h.context, {
      query: "javascript",
      scope: CATEGORY,
    });
    expect(matches.find((r) => r.label === "JavaScript")).toBeDefined();

    const slugMatches = await termLookupAdapter.list(h.context, {
      query: "python-lang",
      scope: CATEGORY,
    });
    expect(slugMatches.find((r) => r.label === "Python")).toBeDefined();
  });

  test("list() respects the limit cap and clamps pathological values", async () => {
    const h = await createRpcHarness();
    for (let i = 0; i < 5; i++) {
      await termFactory.transient({ db: h.context.db }).create();
    }
    expect(
      await termLookupAdapter.list(h.context, { limit: 2, scope: CATEGORY }),
    ).toHaveLength(2);
    const all = await termLookupAdapter.list(h.context, {
      limit: 0,
      scope: CATEGORY,
    });
    expect(all.length).toBeLessThanOrEqual(20);
  });

  test("list() narrows to the declared taxonomies", async () => {
    const h = await createRpcHarness();
    await categoryTerm
      .transient({ db: h.context.db })
      .create({ name: "Engineering" });
    await tagTerm.transient({ db: h.context.db }).create({ name: "Hot Take" });

    const cats = await termLookupAdapter.list(h.context, { scope: CATEGORY });
    expect(cats.find((r) => r.label === "Engineering")).toBeDefined();
    expect(cats.find((r) => r.label === "Hot Take")).toBeUndefined();
  });

  test("list() returns subtitle including taxonomy + slug", async () => {
    const h = await createRpcHarness();
    await categoryTerm
      .transient({ db: h.context.db })
      .create({ name: "Sub Test", slug: "sub-test" });
    const results = await termLookupAdapter.list(h.context, {
      query: "Sub Test",
      scope: CATEGORY,
    });
    const row = results.find((r) => r.label === "Sub Test");
    expect(row?.subtitle).toContain("category");
    expect(row?.subtitle).toContain("sub-test");
  });

  test("resolve() returns null for missing / orphaned ids", async () => {
    const h = await createRpcHarness();
    expect(
      await termLookupAdapter.resolve(h.context, "999999", CATEGORY),
    ).toBeNull();
    expect(
      await termLookupAdapter.resolve(h.context, "abc", CATEGORY),
    ).toBeNull();
  });

  test("resolve() returns the lookup result for valid in-scope ids", async () => {
    const h = await createRpcHarness();
    const t = await categoryTerm
      .transient({ db: h.context.db })
      .create({ name: "Resolved" });
    const result = await termLookupAdapter.resolve(
      h.context,
      String(t.id),
      CATEGORY,
    );
    expect(result?.id).toBe(String(t.id));
    expect(result?.label).toBe("Resolved");
  });

  test("resolve() returns null when the id exists but fails scope", async () => {
    const h = await createRpcHarness();
    const t = await tagTerm.transient({ db: h.context.db }).create();
    expect(
      await termLookupAdapter.resolve(h.context, String(t.id), CATEGORY),
    ).toBeNull();
  });
});
