import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerTermTaxonomy("category", { label: "Categories" });
  },
});

const site = await testSite({ plugins: [blog] });

describe("searching the admin", () => {
  test("groups matching entries by type, matching on the title", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.entry.create({
      authorId: editor.id,
      title: "Hello World",
      slug: "hello",
      status: "published",
    });
    await site.factory.entry.create({
      authorId: editor.id,
      title: "Unrelated",
      slug: "other",
      status: "published",
    });

    const groups = await site
      .actingAs(editor)
      .rpc.search.query({ query: "hello" });

    expect(groups).toEqual([
      expect.objectContaining({
        key: "entry:post",
        items: [expect.objectContaining({ title: "Hello World" })],
      }),
    ]);
  });

  test("finds a draft for an editor", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.entry.create({
      authorId: editor.id,
      title: "Hidden Draft",
      slug: "d1",
      status: "draft",
    });

    const groups = await site
      .actingAs(editor)
      .rpc.search.query({ query: "hidden" });

    expect(groups[0]?.items).toEqual([
      expect.objectContaining({ title: "Hidden Draft" }),
    ]);
  });

  test("finds an author's own draft, as reading an entry does", async () => {
    const author = await site.factory.author.create();
    await site.factory.entry.create({
      authorId: author.id,
      title: "My Own Draft",
      slug: "d2",
      status: "draft",
    });

    const groups = await site
      .actingAs(author)
      .rpc.search.query({ query: "own" });

    expect(groups[0]?.items).toEqual([
      expect.objectContaining({ title: "My Own Draft" }),
    ]);
  });

  test("leaves out trashed entries, even for an editor", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.entry.create({
      authorId: editor.id,
      title: "Trashed Item",
      slug: "t1",
      status: "trash",
    });

    const groups = await site
      .actingAs(editor)
      .rpc.search.query({ query: "trashed" });

    expect(groups).toEqual([]);
  });

  test("finds nothing for an empty query", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.entry.create({
      authorId: editor.id,
      title: "Hello",
      slug: "h",
      status: "published",
    });

    const groups = await site
      .actingAs(editor)
      .rpc.search.query({ query: "  " });

    expect(groups).toEqual([]);
  });

  test("groups matching terms by taxonomy", async () => {
    await site.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });
    await site.factory.term.create({
      taxonomy: "category",
      name: "Unrelated",
      slug: "unrelated",
    });

    const groups = await site
      .actingAs("editor")
      .rpc.search.query({ query: "news" });

    expect(groups).toEqual([
      expect.objectContaining({
        key: "term:category",
        items: [expect.objectContaining({ title: "News" })],
      }),
    ]);
  });

  test("groups matching users for a caller who can list users", async () => {
    await site.factory.user.create({
      name: "Alice Smith",
      email: "alice@example.com",
    });
    await site.factory.user.create({
      name: "Bob Jones",
      email: "bob@example.com",
    });

    const groups = await site
      .actingAs("editor")
      .rpc.search.query({ query: "alice" });

    expect(groups).toEqual([
      expect.objectContaining({
        key: "users",
        items: [expect.objectContaining({ title: "Alice Smith" })],
      }),
    ]);
  });

  test("leaves out users for a caller who cannot list them", async () => {
    await site.factory.user.create({
      name: "Alice Smith",
      email: "alice@example.com",
    });

    const groups = await site
      .actingAs("author")
      .rpc.search.query({ query: "alice" });

    expect(groups).toEqual([]);
  });
});
