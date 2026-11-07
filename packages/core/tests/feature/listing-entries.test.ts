import { describe, expect, test } from "vitest";

import { testSite } from "../../src/test/site.js";

/**
 * No entry type is registered, so `post` reaches only core's built-in
 * `entry:post:*` capabilities.
 */
const site = await testSite({});

describe("listing entries", () => {
  test("a member gets the published entries by default", async () => {
    const member = await site.factory.member.create();
    await site.factory.published.create({ authorId: member.id, slug: "pub-1" });
    await site.factory.draft.create({ authorId: member.id, slug: "draft-1" });

    const rows = await site.actingAs(member).rpc.entry.list({});

    expect(rows).toEqual([expect.objectContaining({ slug: "pub-1" })]);
  });

  test("an editor sees drafts through the status filter", async () => {
    await site.factory.published.create({ slug: "pub-2" });
    await site.factory.draft.create({ slug: "draft-2" });

    const rows = await site.actingAs("editor").rpc.entry.list({
      status: "draft",
    });

    expect(rows).toEqual([expect.objectContaining({ slug: "draft-2" })]);
  });

  test("a member asking for drafts gets an empty list, not a forbidden", async () => {
    const member = await site.factory.member.create();
    await site.factory.draft.create({ authorId: member.id, slug: "secret" });

    const rows = await site.actingAs(member).rpc.entry.list({
      status: "draft",
    });

    expect(rows).toEqual([]);
  });

  test("pages through limit and offset", async () => {
    await site.factory.entry.createList(5);
    const editor = site.actingAs("editor");

    const page1 = await editor.rpc.entry.list({ limit: 2, offset: 0 });
    const page2 = await editor.rpc.entry.list({ limit: 2, offset: 2 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0]?.id).not.toBe(page2[0]?.id);
  });

  test("an entry type nobody registered is forbidden", async () => {
    const list = site.actingAs("admin").rpc.entry.list({
      type: "unknown_type",
    });

    await expect(list).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:unknown_type:read" },
    });
  });

  test("the default leaves out trashed entries, like the All tab", async () => {
    await site.factory.published.create({ slug: "pub" });
    await site.factory.draft.create({ slug: "draft" });
    await site.factory.published.create({ slug: "trashed", status: "trash" });

    const rows = await site.actingAs("editor").rpc.entry.list({});

    expect(rows.map((r) => r.slug).sort()).toEqual(["draft", "pub"]);
  });

  test("the trash status lists trashed entries", async () => {
    await site.factory.published.create({ slug: "live" });
    await site.factory.published.create({ slug: "gone", status: "trash" });

    const rows = await site.actingAs("editor").rpc.entry.list({
      status: "trash",
    });

    expect(rows.map((r) => r.slug)).toEqual(["gone"]);
  });

  test("a list of statuses unites them", async () => {
    await site.factory.published.create({ slug: "pub" });
    await site.factory.draft.create({ slug: "draft" });
    await site.factory.published.create({
      slug: "scheduled",
      status: "scheduled",
    });

    const rows = await site.actingAs("editor").rpc.entry.list({
      status: ["draft", "scheduled"],
    });

    expect(rows.map((r) => r.slug).sort()).toEqual(["draft", "scheduled"]);
  });

  test("a member asking for a list of statuses that includes a non-public one gets an empty list", async () => {
    const member = await site.factory.member.create();
    await site.factory.draft.create({ authorId: member.id, slug: "secret" });
    await site.factory.published.create({ authorId: member.id, slug: "ok" });

    // `published` is allowed, but the list mixes in a status the caller
    // can't see, so it is filtered silently, as WordPress does.
    const rows = await site.actingAs(member).rpc.entry.list({
      status: ["published", "draft"],
    });

    expect(rows).toEqual([]);
  });

  test("a member asking for ['published'] gets what 'published' gets", async () => {
    const member = await site.factory.member.create();
    await site.factory.published.create({
      authorId: member.id,
      slug: "visible",
    });
    await site.factory.draft.create({ authorId: member.id, slug: "hidden" });

    const rows = await site.actingAs(member).rpc.entry.list({
      status: ["published"],
    });

    expect(rows.map((r) => r.slug)).toEqual(["visible"]);
  });

  test("an author filter lists the caller's own entries", async () => {
    const editor = await site.factory.editor.create();
    const other = await site.factory.user.create();
    await site.factory.published.create({ authorId: editor.id, slug: "by-me" });
    await site.factory.published.create({
      authorId: other.id,
      slug: "by-other",
    });

    const mine = await site.actingAs(editor).rpc.entry.list({
      authorId: editor.id,
    });

    expect(mine.map((r) => r.slug)).toEqual(["by-me"]);
  });

  test("an author filter lists another user's entries", async () => {
    const editor = await site.factory.editor.create();
    const other = await site.factory.user.create();
    await site.factory.published.create({ authorId: editor.id, slug: "by-me" });
    await site.factory.published.create({
      authorId: other.id,
      slug: "by-other",
    });

    const theirs = await site.actingAs(editor).rpc.entry.list({
      authorId: other.id,
    });

    expect(theirs.map((r) => r.slug)).toEqual(["by-other"]);
  });

  test("ordering by title ascending sorts alphabetically", async () => {
    await site.factory.published.create({ title: "Charlie", slug: "c" });
    await site.factory.published.create({ title: "Alpha", slug: "a" });
    await site.factory.published.create({ title: "Bravo", slug: "b" });

    const rows = await site.actingAs("editor").rpc.entry.list({
      orderBy: "title",
      order: "asc",
    });

    expect(rows.map((r) => r.slug)).toEqual(["a", "b", "c"]);
  });

  test("ordering by sort_order follows the explicit order values", async () => {
    await site.factory.published.create({ slug: "third", sortOrder: 30 });
    await site.factory.published.create({ slug: "first", sortOrder: 10 });
    await site.factory.published.create({ slug: "second", sortOrder: 20 });

    const rows = await site.actingAs("editor").rpc.entry.list({
      orderBy: "sort_order",
      order: "asc",
    });

    expect(rows.map((r) => r.slug)).toEqual(["first", "second", "third"]);
  });
});

describe("listing entries by parent", () => {
  test("a null parent lists only top-level entries", async () => {
    const root = await site.factory.published.create({ slug: "root-page" });
    await site.factory.published.create({
      slug: "child-page",
      parentId: root.id,
    });

    const top = await site.actingAs("admin").rpc.entry.list({
      parentId: null,
    });

    expect(top.map((p) => p.slug)).toEqual(["root-page"]);
  });

  test("a parent id lists only that entry's direct children", async () => {
    const root = await site.factory.published.create({ slug: "parent" });
    const child = await site.factory.published.create({
      slug: "child",
      parentId: root.id,
    });
    await site.factory.published.create({ slug: "unrelated" });

    const children = await site.actingAs("admin").rpc.entry.list({
      parentId: root.id,
    });

    expect(children.map((p) => p.id)).toEqual([child.id]);
  });

  test("an omitted parent lists every depth flat", async () => {
    const root = await site.factory.published.create({ slug: "p-root" });
    await site.factory.published.create({ slug: "p-child", parentId: root.id });

    const all = await site.actingAs("admin").rpc.entry.list({});

    expect(all.map((p) => p.slug).sort()).toEqual(["p-child", "p-root"]);
  });
});

describe("searching entries", () => {
  test("matches on title", async () => {
    await site.factory.published.create({
      title: "Hello world",
      slug: "hello",
    });
    await site.factory.published.create({
      title: "Unrelated",
      slug: "unrelated",
    });

    const rows = await site.actingAs("editor").rpc.entry.list({
      search: "hello",
    });

    expect(rows.map((r) => r.slug)).toEqual(["hello"]);
  });

  test("matches on excerpt but never on the content envelope", async () => {
    await site.factory.published.create({
      title: "Generic",
      slug: "in-body",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "p1",
            name: "core/rich-text",
            attrs: { body: "<p>A paragraph mentioning giraffes.</p>" },
          },
        ],
      },
    });
    await site.factory.published.create({
      title: "Generic",
      slug: "in-excerpt",
      excerpt: "All about giraffes.",
    });

    const rows = await site.actingAs("editor").rpc.entry.list({
      search: "giraffes",
    });

    expect(rows.map((r) => r.slug)).toEqual(["in-excerpt"]);
  });

  test("several terms must each hit some column", async () => {
    await site.factory.published.create({
      title: "Quantum physics intro",
      slug: "both",
    });
    await site.factory.published.create({
      title: "Quantum only",
      slug: "quantum-only",
    });
    await site.factory.published.create({
      title: "Physics only",
      slug: "physics-only",
    });

    const rows = await site.actingAs("editor").rpc.entry.list({
      search: "quantum physics",
    });

    expect(rows.map((r) => r.slug)).toEqual(["both"]);
  });

  test("a quoted phrase matches verbatim across whitespace", async () => {
    await site.factory.published.create({
      title: "quantum physics",
      slug: "phrase-hit",
    });
    await site.factory.published.create({
      title: "quantum mechanics and physics",
      slug: "phrase-miss",
    });

    const rows = await site.actingAs("editor").rpc.entry.list({
      search: '"quantum physics"',
    });

    expect(rows.map((r) => r.slug)).toEqual(["phrase-hit"]);
  });

  test("a leading dash excludes the term", async () => {
    await site.factory.published.create({
      title: "Pillow for sale",
      slug: "pillow-sofa",
      excerpt: "Comes with a sofa",
    });
    await site.factory.published.create({
      title: "Standalone pillow",
      slug: "pillow-only",
    });

    const rows = await site.actingAs("editor").rpc.entry.list({
      search: "pillow -sofa",
    });

    expect(rows.map((r) => r.slug)).toEqual(["pillow-only"]);
  });

  test("a LIKE wildcard in the query is matched literally", async () => {
    await site.factory.published.create({
      title: "Save 50% today",
      slug: "with-percent",
    });
    await site.factory.published.create({
      title: "Nothing special",
      slug: "plain",
    });

    // A literal `%` matches only "50%", not everything.
    const rows = await site.actingAs("editor").rpc.entry.list({
      search: "50%",
    });

    expect(rows.map((r) => r.slug)).toEqual(["with-percent"]);
  });
});

describe("listing entries by term", () => {
  test("several terms of one taxonomy match any of them", async () => {
    const news = await site.factory.category.create({
      name: "news",
      slug: "news",
    });
    const tutorials = await site.factory.category.create({
      name: "tutorials",
      slug: "tutorials",
    });
    const p1 = await site.factory.published.create({ slug: "news-post" });
    const p2 = await site.factory.published.create({ slug: "tut-post" });
    await site.factory.published.create({ slug: "untagged" });
    await site.factory.entryTerm.create({ entryId: p1.id, termId: news.id });
    await site.factory.entryTerm.create({
      entryId: p2.id,
      termId: tutorials.id,
    });

    const rows = await site.actingAs("editor").rpc.entry.list({
      termTaxonomies: { category: ["news", "tutorials"] },
    });

    expect(rows.map((r) => r.slug).sort()).toEqual(["news-post", "tut-post"]);
  });

  test("terms of several taxonomies must each match", async () => {
    const news = await site.factory.category.create({
      name: "news",
      slug: "news",
    });
    const urgent = await site.factory.tag.create({
      name: "urgent",
      slug: "urgent",
    });
    const both = await site.factory.published.create({ slug: "both" });
    const newsOnly = await site.factory.published.create({ slug: "news-only" });
    const urgentOnly = await site.factory.published.create({
      slug: "urgent-only",
    });
    await site.factory.entryTerm.create({ entryId: both.id, termId: news.id });
    await site.factory.entryTerm.create({
      entryId: both.id,
      termId: urgent.id,
    });
    await site.factory.entryTerm.create({
      entryId: newsOnly.id,
      termId: news.id,
    });
    await site.factory.entryTerm.create({
      entryId: urgentOnly.id,
      termId: urgent.id,
    });

    const rows = await site.actingAs("editor").rpc.entry.list({
      termTaxonomies: { category: ["news"], tag: ["urgent"] },
    });

    expect(rows.map((r) => r.slug)).toEqual(["both"]);
  });

  test("an empty slug list leaves that taxonomy unfiltered", async () => {
    await site.factory.published.create({ slug: "a" });
    await site.factory.published.create({ slug: "b" });

    const rows = await site.actingAs("editor").rpc.entry.list({
      termTaxonomies: { category: [] },
    });

    expect(rows.map((r) => r.slug).sort()).toEqual(["a", "b"]);
  });

  test("a slug matches only within its own taxonomy", async () => {
    // `{ category: ["news"] }` must not match an entry tagged `tag:news`.
    const catNews = await site.factory.category.create({
      name: "news",
      slug: "news",
    });
    const tagNews = await site.factory.tag.create({
      name: "news",
      slug: "news",
    });
    const catPost = await site.factory.published.create({
      slug: "in-category",
    });
    const tagPost = await site.factory.published.create({ slug: "in-tag" });
    await site.factory.entryTerm.create({
      entryId: catPost.id,
      termId: catNews.id,
    });
    await site.factory.entryTerm.create({
      entryId: tagPost.id,
      termId: tagNews.id,
    });

    const rows = await site.actingAs("editor").rpc.entry.list({
      termTaxonomies: { category: ["news"] },
    });

    expect(rows.map((r) => r.slug)).toEqual(["in-category"]);
  });

  test("a term filter composes with search", async () => {
    const news = await site.factory.category.create({
      name: "news",
      slug: "news",
    });
    const matches = await site.factory.published.create({
      title: "Quantum breakthrough",
      slug: "qbn",
    });
    // The same title with no term, which the term filter leaves out.
    await site.factory.published.create({
      title: "Quantum breakthrough elsewhere",
      slug: "qbn-2",
    });
    await site.factory.entryTerm.create({
      entryId: matches.id,
      termId: news.id,
    });

    const rows = await site.actingAs("editor").rpc.entry.list({
      search: "quantum",
      termTaxonomies: { category: ["news"] },
    });

    expect(rows.map((r) => r.slug)).toEqual(["qbn"]);
  });
});
