import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const categories = definePlugin("categories", {
  setup: (ctx) => {
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      isHierarchical: true,
    });
  },
});

const site = await testSite({ plugins: [categories] });

describe("listing terms", () => {
  test("returns the terms in the requested taxonomy", async () => {
    await site.factory.category.create({ name: "Alpha", slug: "alpha" });
    await site.factory.category.create({ name: "Beta", slug: "beta" });

    const rows = await site
      .actingAs("member")
      .rpc.term.list({ taxonomy: "category" });

    expect(rows.map((r) => r.slug).sort()).toEqual(["alpha", "beta"]);
  });

  test("in a taxonomy nobody registered is not found", async () => {
    await expect(
      site.actingAs("admin").rpc.term.list({ taxonomy: "unknown" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "taxonomy", id: "unknown" },
    });
  });

  test("with a null parent returns only top-level terms", async () => {
    const root = await site.factory.category.create({
      name: "Root",
      slug: "root",
    });
    await site.factory.category.create({
      name: "Child",
      slug: "child",
      parentId: root.id,
    });

    const top = await site
      .actingAs("member")
      .rpc.term.list({ taxonomy: "category", parentId: null });

    expect(top.map((r) => r.slug)).toEqual(["root"]);
  });
});

describe("reading a term", () => {
  test("returns the term", async () => {
    const row = await site.factory.category.create({
      name: "Got",
      slug: "got",
    });

    const got = await site.actingAs("member").rpc.term.get({ id: row.id });

    expect(got.slug).toBe("got");
  });

  test("that does not exist is not found", async () => {
    await expect(
      site.actingAs("member").rpc.term.get({ id: 9999 }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "term", id: 9999 },
    });
  });
});
