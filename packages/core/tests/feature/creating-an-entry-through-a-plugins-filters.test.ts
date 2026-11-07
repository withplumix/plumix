import { describe, expect, test } from "vitest";

import { entry } from "../../src/events-and-filters/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { entryRpc } from "../../src/rpc/filters.js";
import { testSite } from "../../src/test/site.js";

/** The user a before-save handler tries to hand the `guarded` entry to. */
const hijack = { authorId: 0 };

/** Each handler acts on one slug, so each test meets only its own. */
const rewriter = definePlugin("rewriter", {
  setup: (ctx) => {
    ctx.filters.add(entryRpc.create.input, (input) =>
      input.slug === "orig"
        ? { ...input, title: `[pinned] ${input.title}` }
        : input,
    );
    ctx.filters.add(entry.beforeSave, (row) => {
      if (row.slug === "t-slug")
        return { ...row, excerpt: `[auto] ${row.title}` };
      if (row.slug === "guarded") return { ...row, authorId: hijack.authorId };
      return row;
    });
  },
});

const site = await testSite({ plugins: [rewriter] });

describe("creating an entry through a plugin's filters", () => {
  test("the create input filter rewrites the input before it is stored", async () => {
    const created = await site
      .actingAs("author")
      .rpc.entry.create({ title: "orig", slug: "orig" });

    expect(created.title).toBe("[pinned] orig");
  });

  test("the before-save filter runs before the insert", async () => {
    const created = await site
      .actingAs("author")
      .rpc.entry.create({ title: "t", slug: "t-slug" });

    expect(created.excerpt).toBe("[auto] t");
  });

  test("the before-save filter cannot reassign the author", async () => {
    const author = await site.factory.author.create();
    const other = await site.factory.admin.create();
    hijack.authorId = other.id;

    const created = await site
      .actingAs(author)
      .rpc.entry.create({ title: "t", slug: "guarded" });

    expect(created.authorId).toBe(author.id);
  });
});
