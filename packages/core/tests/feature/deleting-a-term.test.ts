import { describe, expect, test } from "vitest";

import { eq, inArray } from "../../src/db/index.js";
import { terms } from "../../src/db/schema/terms.js";
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

describe("deleting a term", () => {
  test("by an editor lands and lifts its children to the top level", async () => {
    const parent = await site.factory.category.create({ name: "P", slug: "p" });
    const child = await site.factory.category.create({
      name: "C",
      slug: "c",
      parentId: parent.id,
    });

    await site.actingAs("editor").rpc.term.delete({ id: parent.id });

    const orphan = await site.context.db.query.terms.findFirst({
      where: eq(terms.id, child.id),
    });
    expect(orphan?.parentId).toBeNull();
  });

  test("moves the token of each child it re-parents", async () => {
    const parent = await site.factory.category.create();
    const first = await site.factory.category.create({ parentId: parent.id });
    const second = await site.factory.category.create({ parentId: parent.id });

    await site.actingAs("editor").rpc.term.delete({ id: parent.id });

    const versions = await site.context.db
      .select({ id: terms.id, version: terms.version })
      .from(terms)
      .where(inArray(terms.id, [first.id, second.id]))
      .orderBy(terms.id);
    expect(versions).toEqual([
      { id: first.id, version: first.version + 1 },
      { id: second.id, version: second.version + 1 },
    ]);
  });

  test("by an author is forbidden", async () => {
    const row = await site.factory.category.create({ name: "X", slug: "x" });

    await expect(
      site.actingAs("author").rpc.term.delete({ id: row.id }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "term:category:delete" },
    });
  });

  test("that does not exist is not found", async () => {
    await expect(
      site.actingAs("editor").rpc.term.delete({ id: 9999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
