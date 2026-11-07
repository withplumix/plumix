import { describe, expect, test } from "vitest";

import { term } from "../../src/hooks/term.js";
import { definePlugin } from "../../src/plugin/define.js";
import { text } from "../../src/plugin/fields/index.js";
import { testSite } from "../../src/test/site.js";

const taxonomies = definePlugin("taxonomies", {
  setup: (ctx) => {
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      isHierarchical: true,
    });
    ctx.registerTermTaxonomy("post_tag", { label: "Tags" });
    ctx.registerTermMetaBox("category-icon", {
      label: "Icon",
      termTaxonomies: ["category"],
      fields: [text("icon")],
    });
  },
});

const site = await testSite({ plugins: [taxonomies] });

describe("creating a term", () => {
  test("announces the meta it was created with, and only then", async () => {
    const editor = site.actingAs("editor");
    await editor.rpc.term.create({
      taxonomy: "category",
      name: "With",
      slug: "with",
      meta: { icon: "leaf" },
    });
    await editor.rpc.term.create({
      taxonomy: "category",
      name: "Without",
      slug: "without",
    });

    expect(
      site.events.emitted(term.metaChanged).map((payload) => payload.changes),
    ).toEqual([{ set: { icon: "leaf" }, removed: [] }]);
  });

  test("by an editor lands", async () => {
    const created = await site.actingAs("editor").rpc.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });

    expect(created.slug).toBe("news");
  });

  test("by an author is forbidden, since editing terms takes an editor", async () => {
    await expect(
      site.actingAs("author").rpc.term.create({
        taxonomy: "category",
        name: "Nope",
        slug: "nope",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "term:category:edit" },
    });
  });

  test("with a slug another term of the taxonomy holds conflicts", async () => {
    const editor = site.actingAs("editor");
    await editor.rpc.term.create({
      taxonomy: "category",
      name: "Dup",
      slug: "dup",
    });

    await expect(
      editor.rpc.term.create({
        taxonomy: "category",
        name: "Dup2",
        slug: "dup",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });

  test("under a parent from another taxonomy conflicts", async () => {
    const tag = await site.factory.term.create({
      taxonomy: "post_tag",
      name: "Tag",
      slug: "tag-1",
    });

    await expect(
      site.actingAs("editor").rpc.term.create({
        taxonomy: "category",
        name: "Child",
        slug: "child",
        parentId: tag.id,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_mismatch" },
    });
  });
});
