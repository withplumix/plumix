import { describe, expect, test } from "vitest";

import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { entryTerm } from "../../../db/schema/entry_term.js";
import { terms } from "../../../db/schema/terms.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

async function seedTerm(
  h: Awaited<ReturnType<typeof createRpcHarness>>,
  termTaxonomy: string,
  slug: string,
): Promise<number> {
  const [row] = await h.context.db
    .insert(terms)
    .values({ taxonomy: termTaxonomy, name: slug, slug })
    .returning();
  if (!row) throw new Error("seedTerm: insert returned no row");
  return row.id;
}

async function attachTerm(
  h: Awaited<ReturnType<typeof createRpcHarness>>,
  entryId: number,
  termId: number,
): Promise<void> {
  await h.context.db.insert(entryTerm).values({ entryId, termId });
}

describe("entry.list", () => {
  test("returns published entries by default for subscriber", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await h.factory.published.create({ authorId: h.user.id, slug: "pub-1" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "draft-1" });

    const rows = await h.client.entry.list({});
    expect(rows).toEqual([expect.objectContaining({ slug: "pub-1" })]);
  });

  test("editor can see drafts by status filter", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({ authorId: h.user.id, slug: "pub-2" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "draft-2" });

    const rows = await h.client.entry.list({ status: "draft" });
    expect(rows).toEqual([expect.objectContaining({ slug: "draft-2" })]);
  });

  test("subscriber asking for drafts gets an empty list, not a 403", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "secret" });

    const rows = await h.client.entry.list({ status: "draft" });
    expect(rows).toEqual([]);
  });

  test("honours pagination (limit + offset)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.entry.createList(5, { authorId: h.user.id });

    const page1 = await h.client.entry.list({ limit: 2, offset: 0 });
    const page2 = await h.client.entry.list({ limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    const [firstOfPage1] = page1;
    const [firstOfPage2] = page2;
    expect(firstOfPage1?.id).not.toBe(firstOfPage2?.id);
  });

  test("forbidden for a non-registered post type", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.entry.list({ type: "unknown_type" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:unknown_type:read" },
    });
  });

  test("parentId=null returns only top-level entries", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const root = await h.factory.published.create({
      authorId: h.user.id,
      slug: "root-page",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "child-page",
      parentId: root.id,
    });

    const top = await h.client.entry.list({ parentId: null });
    expect(top.map((p) => p.slug)).toEqual(["root-page"]);
  });

  test("parentId=<id> returns only direct children of that post", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const root = await h.factory.published.create({
      authorId: h.user.id,
      slug: "parent",
    });
    const child = await h.factory.published.create({
      authorId: h.user.id,
      slug: "child",
      parentId: root.id,
    });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "unrelated",
    });

    const children = await h.client.entry.list({ parentId: root.id });
    expect(children.map((p) => p.id)).toEqual([child.id]);
  });

  test("omitted parentId returns a flat list across depths", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const root = await h.factory.published.create({
      authorId: h.user.id,
      slug: "p-root",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "p-child",
      parentId: root.id,
    });

    const all = await h.client.entry.list({});
    expect(all.map((p) => p.slug).sort()).toEqual(["p-child", "p-root"]);
  });

  test("search matches on title", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Hello world",
      slug: "hello",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Unrelated",
      slug: "unrelated",
    });

    const rows = await h.client.entry.list({ search: "hello" });
    expect(rows.map((r) => r.slug)).toEqual(["hello"]);
  });

  test("search also matches on content and excerpt (OR across columns)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Generic",
      slug: "in-body",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "A paragraph mentioning giraffes in passing.",
              },
            ],
          },
        ],
      },
    });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Generic",
      slug: "in-excerpt",
      excerpt: "All about giraffes.",
    });

    const rows = await h.client.entry.list({ search: "giraffes" });
    expect(rows.map((r) => r.slug).sort()).toEqual(["in-body", "in-excerpt"]);
  });

  test("multi-term search AND-combines (each term must hit some column)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Quantum physics intro",
      slug: "both",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Quantum only",
      slug: "quantum-only",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Physics only",
      slug: "physics-only",
    });

    const rows = await h.client.entry.list({ search: "quantum physics" });
    expect(rows.map((r) => r.slug)).toEqual(["both"]);
  });

  test("quoted phrases match verbatim across whitespace", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "quantum physics",
      slug: "phrase-hit",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "quantum mechanics and physics",
      slug: "phrase-miss",
    });

    const rows = await h.client.entry.list({ search: '"quantum physics"' });
    expect(rows.map((r) => r.slug)).toEqual(["phrase-hit"]);
  });

  test("leading dash excludes the term (NOT LIKE)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Pillow for sale",
      slug: "pillow-sofa",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Comes with a sofa" }],
          },
        ],
      },
    });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Standalone pillow",
      slug: "pillow-only",
    });

    const rows = await h.client.entry.list({ search: "pillow -sofa" });
    expect(rows.map((r) => r.slug)).toEqual(["pillow-only"]);
  });

  test("LIKE wildcards in user input are escaped, not interpreted", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Save 50% today",
      slug: "with-percent",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Nothing special",
      slug: "plain",
    });

    // A literal `%` in the query should match only "50%", not everything.
    const rows = await h.client.entry.list({ search: "50%" });
    expect(rows.map((r) => r.slug)).toEqual(["with-percent"]);
  });

  test("termTaxonomy filter: single termTaxonomy, IN across term slugs", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const news = await seedTerm(h, "category", "news");
    const tutorials = await seedTerm(h, "category", "tutorials");
    const p1 = await h.factory.published.create({
      authorId: h.user.id,
      slug: "news-post",
    });
    const p2 = await h.factory.published.create({
      authorId: h.user.id,
      slug: "tut-post",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "untagged",
    });
    await attachTerm(h, p1.id, news);
    await attachTerm(h, p2.id, tutorials);

    const rows = await h.client.entry.list({
      termTaxonomies: { category: ["news", "tutorials"] },
    });
    expect(rows.map((r) => r.slug).sort()).toEqual(["news-post", "tut-post"]);
  });

  test("termTaxonomy filter: AND across termTaxonomies (post must match each)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const news = await seedTerm(h, "category", "news");
    const urgent = await seedTerm(h, "tag", "urgent");
    const both = await h.factory.published.create({
      authorId: h.user.id,
      slug: "both",
    });
    const newsOnly = await h.factory.published.create({
      authorId: h.user.id,
      slug: "news-only",
    });
    const urgentOnly = await h.factory.published.create({
      authorId: h.user.id,
      slug: "urgent-only",
    });
    await attachTerm(h, both.id, news);
    await attachTerm(h, both.id, urgent);
    await attachTerm(h, newsOnly.id, news);
    await attachTerm(h, urgentOnly.id, urgent);

    const rows = await h.client.entry.list({
      termTaxonomies: { category: ["news"], tag: ["urgent"] },
    });
    expect(rows.map((r) => r.slug)).toEqual(["both"]);
  });

  test("termTaxonomy filter: empty slug array is a no-op for that termTaxonomy", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({ authorId: h.user.id, slug: "a" });
    await h.factory.published.create({ authorId: h.user.id, slug: "b" });

    const rows = await h.client.entry.list({
      termTaxonomies: { category: [] },
    });
    expect(rows.map((r) => r.slug).sort()).toEqual(["a", "b"]);
  });

  test("termTaxonomy filter: slug scoped to termTaxonomy (no cross-termTaxonomy leak)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    // Same slug in two termTaxonomies — filter must only match within the
    // specified termTaxonomy. `{ category: ["news"] }` should NOT match a
    // post tagged `tag:news`.
    const catNews = await seedTerm(h, "category", "news");
    const tagNews = await seedTerm(h, "tag", "news");
    const catPost = await h.factory.published.create({
      authorId: h.user.id,
      slug: "in-category",
    });
    const tagPost = await h.factory.published.create({
      authorId: h.user.id,
      slug: "in-tag",
    });
    await attachTerm(h, catPost.id, catNews);
    await attachTerm(h, tagPost.id, tagNews);

    const rows = await h.client.entry.list({
      termTaxonomies: { category: ["news"] },
    });
    expect(rows.map((r) => r.slug)).toEqual(["in-category"]);
  });

  test("termTaxonomy filter composes with search", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const news = await seedTerm(h, "category", "news");
    const matches = await h.factory.published.create({
      authorId: h.user.id,
      title: "Quantum breakthrough",
      slug: "qbn",
    });
    const notTagged = await h.factory.published.create({
      authorId: h.user.id,
      title: "Quantum breakthrough elsewhere",
      slug: "qbn-2",
    });
    await attachTerm(h, matches.id, news);
    // `notTagged` has the same title but no term — termTaxonomy filter excludes it

    const rows = await h.client.entry.list({
      search: "quantum",
      termTaxonomies: { category: ["news"] },
    });
    expect(rows.map((r) => r.slug)).toEqual(["qbn"]);
    expect(rows.map((r) => r.slug)).not.toContain(notTagged.slug);
  });

  test("default (no status) excludes trashed entries — matches WP's All tab", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({ authorId: h.user.id, slug: "pub" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "draft" });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "trashed",
      status: "trash",
    });

    const rows = await h.client.entry.list({});
    expect(rows.map((r) => r.slug).sort()).toEqual(["draft", "pub"]);
  });

  test("explicit status: 'trash' surfaces trashed entries (dedicated view)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({ authorId: h.user.id, slug: "live" });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "gone",
      status: "trash",
    });

    const rows = await h.client.entry.list({ status: "trash" });
    expect(rows.map((r) => r.slug)).toEqual(["gone"]);
  });

  test("status array unions across listed statuses", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({ authorId: h.user.id, slug: "pub" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "draft" });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "scheduled",
      status: "scheduled",
    });

    const rows = await h.client.entry.list({ status: ["draft", "scheduled"] });
    expect(rows.map((r) => r.slug).sort()).toEqual(["draft", "scheduled"]);
  });

  test("subscriber asking for a status array including non-public gets empty", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "secret" });
    await h.factory.published.create({ authorId: h.user.id, slug: "ok" });

    // Even though `published` is allowed, asking for `[published, draft]`
    // mixes in a status the caller can't see — match WP's silent filter.
    const rows = await h.client.entry.list({
      status: ["published", "draft"],
    });
    expect(rows).toEqual([]);
  });

  test("subscriber asking for status: ['published'] is equivalent to 'published'", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await h.factory.published.create({ authorId: h.user.id, slug: "visible" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "hidden" });

    const rows = await h.client.entry.list({ status: ["published"] });
    expect(rows.map((r) => r.slug)).toEqual(["visible"]);
  });

  test("authorId filters to entries by that user", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const other = await h.factory.user.create({ email: "other@example.test" });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "by-me",
    });
    await h.factory.published.create({
      authorId: other.id,
      slug: "by-other",
    });

    const mine = await h.client.entry.list({ authorId: h.user.id });
    expect(mine.map((r) => r.slug)).toEqual(["by-me"]);

    const theirs = await h.client.entry.list({ authorId: other.id });
    expect(theirs.map((r) => r.slug)).toEqual(["by-other"]);
  });

  test("orderBy=title&order=asc sorts alphabetically", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Charlie",
      slug: "c",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Alpha",
      slug: "a",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      title: "Bravo",
      slug: "b",
    });

    const rows = await h.client.entry.list({
      orderBy: "title",
      order: "asc",
    });
    expect(rows.map((r) => r.slug)).toEqual(["a", "b", "c"]);
  });

  test("orderBy=sort_order respects explicit order values", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "third",
      sortOrder: 30,
    });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "first",
      sortOrder: 10,
    });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "second",
      sortOrder: 20,
    });

    const rows = await h.client.entry.list({
      orderBy: "sort_order",
      order: "asc",
    });
    expect(rows.map((r) => r.slug)).toEqual(["first", "second", "third"]);
  });
});

describe("entry.get", () => {
  test("returns the row when published", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const post = await h.factory.published.create({ authorId: h.user.id });
    const got = await h.client.entry.get({ id: post.id });
    expect(got.id).toBe(post.id);
  });

  test("404 when the row does not exist", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(h.client.entry.get({ id: 9999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("404 (not 403) when a subscriber targets a draft — existence is hidden", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const other = await h.factory.author.create();
    const hidden = await h.factory.draft.create({
      authorId: other.id,
      slug: "hidden",
    });
    await expect(h.client.entry.get({ id: hidden.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("author can fetch their own draft when they have edit_own", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const mine = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "my-draft",
    });
    const got = await h.client.entry.get({ id: mine.id });
    expect(got.status).toBe("draft");
  });

  test("editor can fetch anyone's draft", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const other = await h.factory.author.create();
    const theirs = await h.factory.draft.create({
      authorId: other.id,
      slug: "others-draft",
    });
    const got = await h.client.entry.get({ id: theirs.id });
    expect(got.id).toBe(theirs.id);
  });

  test("response includes a `meta` bag — empty object on a fresh post", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const post = await h.factory.published.create({ authorId: h.user.id });
    const got = await h.client.entry.get({ id: post.id });
    expect(got.meta).toEqual({});
  });

  test("response hydrates the meta bag, typed against the plugin registry", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("test-seo", {
      id: "test-seo",
      label: "SEO",
      entryTypes: ["post"],
      fields: [
        {
          key: "meta_title",
          label: "Meta title",
          type: "string",
          inputType: "text",
        },
        {
          key: "is_featured",
          label: "Featured",
          type: "boolean",
          inputType: "checkbox",
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.published.create({ authorId: h.user.id });
    // Write directly to the column (bypassing the RPC sanitizer) to prove
    // the reader decodes what the writer laid down.
    await h.context.db
      .update(entries)
      .set({ meta: { meta_title: "Seeded", is_featured: true } })
      .where(eq(entries.id, post.id));
    const got = await h.client.entry.get({ id: post.id });
    expect(got.meta).toEqual({ meta_title: "Seeded", is_featured: true });
  });
});
