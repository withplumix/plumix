import { describe, expect, test } from "vitest";

import { ConflictError, etagOf } from "../../../db/concurrency.js";
import { loadEntryTerms } from "../../../entries/terms.js";
import { term } from "../../../events-and-filters/term.js";
import { definePlugin } from "../../../plugin/define.js";
import { testSite } from "../../../test/site.js";

const site = await testSite({
  plugins: [
    definePlugin("blog", {
      setup: (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
        ctx.registerTermTaxonomy("category", {
          label: "Categories",
          isPublic: true,
          entryTypes: ["post"],
        });
        // A request of its own, so the purge it enqueues is flushed.
        ctx.registerRoute({
          method: "POST",
          path: "/assign",
          auth: "authenticated",
          handler: async (request, appCtx) => {
            await appCtx.terms.assign(
              (await request.json()) as { entryId: number; termId: number },
            );
            return new Response(null, { status: 204 });
          },
        });
      },
    }),
  ],
});

describe("ctx.terms.create", () => {
  test("creates the term and announces it", async () => {
    const editor = await site.factory.editor.create();
    const ctx = site.actingAs(editor).context;

    const { term: created } = await ctx.terms.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });

    expect(created).toMatchObject({ taxonomy: "category", slug: "news" });
    site.events.assertEmitted(term.created, {
      term: { id: created.id, slug: "news" },
    });
  });
});

describe("ctx.terms.update", () => {
  test("a save from a stale copy is refused and leaves the newer save's name", async () => {
    const editor = await site.factory.editor.create();
    const row = await site.factory.term.create({ taxonomy: "category" });
    const ctx = site.actingAs(editor).context;
    await ctx.terms.update({ id: row.id, ifMatch: row.version, name: "Newer" });

    await expect(
      ctx.terms.update({ id: row.id, ifMatch: row.version, name: "Stale" }),
    ).rejects.toBeInstanceOf(ConflictError);
    const stored = await site.context.db.query.terms.findFirst({
      where: (terms, { eq }) => eq(terms.id, row.id),
    });
    expect(stored?.name).toBe("Newer");
  });

  test("a save that changes nothing keeps the etag and announces nothing", async () => {
    const editor = await site.factory.editor.create();
    const row = await site.factory.term.create({ taxonomy: "category" });

    const { etag } = await site
      .actingAs(editor)
      .context.terms.update({ id: row.id, ifMatch: row.version });

    expect(etag).toBe(etagOf(row.version));
    site.events.assertNotEmitted(term.updated);
  });
});

describe("ctx.terms.delete", () => {
  test("removes the term and announces it", async () => {
    const editor = await site.factory.editor.create();
    const row = await site.factory.term.create({ taxonomy: "category" });

    await site.actingAs(editor).context.terms.delete(row.id);

    const stored = await site.context.db.query.terms.findFirst({
      where: (terms, { eq }) => eq(terms.id, row.id),
    });
    expect(stored).toBeUndefined();
    site.events.assertEmitted(term.deleted, { term: { id: row.id } });
  });
});

describe("ctx.terms.assign", () => {
  test("attaches the entry after the terms of that taxonomy it already has", async () => {
    const editor = await site.factory.editor.create();
    const post = await site.factory.published.create({ type: "post" });
    const [first, second] = await Promise.all([
      site.factory.term.create({ taxonomy: "category" }),
      site.factory.term.create({ taxonomy: "category" }),
    ]);
    const ctx = site.actingAs(editor).context;

    await ctx.terms.assign({ entryId: post.id, termId: second.id });
    await ctx.terms.assign({ entryId: post.id, termId: first.id });

    expect(await loadEntryTerms(site.context, post.id)).toEqual({
      category: [second.id, first.id],
    });
  });

  test("assigning the same term twice keeps one link", async () => {
    const editor = await site.factory.editor.create();
    const post = await site.factory.published.create({ type: "post" });
    const news = await site.factory.term.create({ taxonomy: "category" });
    const ctx = site.actingAs(editor).context;
    await ctx.terms.assign({ entryId: post.id, termId: news.id });

    await ctx.terms.assign({ entryId: post.id, termId: news.id });

    expect(await loadEntryTerms(site.context, post.id)).toEqual({
      category: [news.id],
    });
  });

  test("an unknown term is not found", async () => {
    const editor = await site.factory.editor.create();
    const post = await site.factory.published.create({ type: "post" });
    await site.factory.term.create({ taxonomy: "category" });

    const assigning = site
      .actingAs(editor)
      .context.terms.assign({ entryId: post.id, termId: 999_999 });

    await expect(assigning).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "term", id: 999_999 },
    });
  });

  test("an unknown entry is not found", async () => {
    const editor = await site.factory.editor.create();
    const news = await site.factory.term.create({ taxonomy: "category" });

    const assigning = site
      .actingAs(editor)
      .context.terms.assign({ entryId: 999_999, termId: news.id });

    await expect(assigning).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: 999_999 },
    });
  });

  test("purges the entry's page, which now shows the term", async () => {
    const editor = await site.factory.editor.create();
    const post = await site.factory.published.create({
      type: "post",
      slug: "hello",
    });
    const news = await site.factory.term.create({ taxonomy: "category" });
    await site.visit("/post/hello");
    site.cdn.assertStored("/post/hello");

    await site.actingAs(editor).visit("/_plumix/blog/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryId: post.id, termId: news.id }),
    });

    site.cdn.assertNotStored("/post/hello");
  });
});
