import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { eq } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { definePlugin } from "../../src/plugin/define.js";
import { text } from "../../src/plugin/fields/index.js";
import { defaultTestTheme } from "../../src/test/default-theme.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerTermTaxonomy("category", { label: "category" });
    ctx.registerEntryMetaBox("box", {
      label: "Box",
      entryTypes: ["post"],
      fields: [text("tone").default("warm")],
    });
  },
});

const site = await testSite({
  plugins: [posts],
  config: {
    // Writes posts but never publishes them, and holds no edit_layout.
    roles: {
      contributor: {
        can: {
          admin: ["access"],
          user: ["edit_own"],
          entry: { post: ["read", "create", "edit_own"] },
          term: { category: ["read", "assign"], tag: ["read", "assign"] },
        },
      },
    },
  },
});

const siteAllowingOnlyGroups = await testSite({
  plugins: [posts],
  config: { theme: { ...defaultTestTheme, allowedBlocks: ["core/group"] } },
});

const siteWithoutCustomStyles = await testSite({
  plugins: [posts],
  config: { theme: { ...defaultTestTheme, allowCustomStyles: false } },
});

describe("duplicating an entry", () => {
  test("makes a new draft copying the content, with a fresh id and slug", async () => {
    const editor = await site.factory.editor.create();
    const source = await site.factory.published.create({
      authorId: editor.id,
      title: "Original",
      slug: "original",
      excerpt: "the excerpt",
      content: { type: "doc", content: [] },
    });

    const copy = await site
      .actingAs(editor)
      .rpc.entry.duplicate({ id: source.id });

    expect(copy.id).not.toBe(source.id);
    expect(copy.status).toBe("draft");
    expect(copy.slug).not.toBe(source.slug);
    expect(copy.excerpt).toBe("the excerpt");
    expect(copy.content).toEqual({ type: "doc", content: [] });
    // Title carries a "copy" marker so the duplicate is distinguishable
    // in the list.
    expect(copy.title).toContain("Original");

    // The copy is a real persisted row, not just an echo of the input.
    const persisted = await site.context.db.query.entries.findFirst({
      where: eq(entries.id, copy.id),
    });
    expect(persisted?.status).toBe("draft");
    expect(persisted?.authorId).toBe(editor.id);
  });

  test("copies an entry holding a block no plugin registers any more", async () => {
    const content = {
      version: "plumix.v2" as const,
      blocks: [{ id: "hero1", name: "acme/hero", attrs: { title: "Hi" } }],
    };
    const source = await site.factory.published.create({ content });

    const copy = await site
      .actingAs("editor")
      .rpc.entry.duplicate({ id: source.id });

    expect(copy.content).toEqual(content);
  });

  test("copies an entry holding blocks for a writer without edit_layout", async () => {
    const contributor = await site.factory.user.create({ role: "contributor" });
    const content = {
      version: "plumix.v2" as const,
      blocks: [
        { id: "p1", name: "core/rich-text", attrs: { body: "<p>Hi</p>" } },
      ],
    };
    const source = await site.factory.draft.create({
      authorId: contributor.id,
      content,
    });

    const copy = await site
      .actingAs(contributor)
      .rpc.entry.duplicate({ id: source.id });

    expect(copy.content).toEqual(content);
  });

  test("copies an entry holding a block the theme no longer allows", async () => {
    const content = {
      version: "plumix.v2" as const,
      blocks: [{ id: "p1", name: "core/rich-text", attrs: {} }],
    };
    const source = await siteAllowingOnlyGroups.factory.published.create({
      content,
    });

    const copy = await siteAllowingOnlyGroups
      .actingAs("editor")
      .rpc.entry.duplicate({ id: source.id });

    expect(copy.content).toEqual(content);
  });

  test("copies an entry holding a style literal the theme no longer allows", async () => {
    const content = {
      version: "plumix.v2" as const,
      blocks: [
        {
          id: "p1",
          name: "core/rich-text",
          attrs: {},
          className: "brand",
          style: { large: { color: "#e11" } },
        },
      ],
    };
    const source = await siteWithoutCustomStyles.factory.published.create({
      content,
    });

    const copy = await siteWithoutCustomStyles
      .actingAs("editor")
      .rpc.entry.duplicate({ id: source.id });

    expect(copy.content).toEqual(content);
  });

  test("refuses a source that fails the block checks in another way", async () => {
    // `core/column` may only sit under `core/columns`.
    const source = await site.factory.published.create({
      content: {
        version: "plumix.v2",
        blocks: [{ id: "col1", name: "core/column", attrs: { content: [] } }],
      },
    });

    const duplicate = site
      .actingAs("editor")
      .rpc.entry.duplicate({ id: source.id });

    await expect(duplicate).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [expect.objectContaining({ code: "requires_parent" })],
      },
    });
  });

  test("answers with the etag a save from the copy sends", async () => {
    const editor = site.actingAs("editor");
    const source = await site.factory.published.create({
      slug: "duplicated-then-saved",
    });
    const copy = await editor.rpc.entry.duplicate({ id: source.id });

    const save = editor.rpc.entry.update({
      id: copy.id,
      title: "Edited copy",
      ifMatch: copy.etag,
    });

    await expect(save).resolves.toMatchObject({ title: "Edited copy" });
  });

  test("twice from the same source yields two distinct slugs", async () => {
    const editor = site.actingAs("editor");
    const source = await site.factory.published.create({
      title: "Twice",
      slug: "twice",
    });

    const first = await editor.rpc.entry.duplicate({ id: source.id });
    const second = await editor.rpc.entry.duplicate({ id: source.id });

    expect(first.slug).not.toBe(second.slug);
    expect(new Set([source.slug, first.slug, second.slug]).size).toBe(3);
  });

  test("copies the source's term assignments", async () => {
    const editor = site.actingAs("editor");
    const category = await site.factory.term.create({
      taxonomy: "category",
      name: "news",
      slug: "news",
    });
    const source = await site.factory.published.create({
      title: "Tagged",
      slug: "tagged",
    });
    await editor.rpc.entry.update({
      id: source.id,
      terms: { category: [category.id] },
      ifMatch: etagOf(source.updatedAt),
    });

    const copy = await editor.rpc.entry.duplicate({ id: source.id });

    const fetched = await editor.rpc.entry.get({ id: copy.id });
    expect(fetched.terms.category).toEqual([category.id]);
  });

  test("copies the source's raw meta column", async () => {
    const source = await site.factory.published.create({
      title: "Has meta",
      slug: "has-meta",
      meta: { featured: true },
    });

    const copy = await site
      .actingAs("editor")
      .rpc.entry.duplicate({ id: source.id });

    const persisted = await site.context.db.query.entries.findFirst({
      where: eq(entries.id, copy.id),
    });
    expect(persisted?.meta).toEqual({ featured: true });
  });

  test("a duplicate of a duplicate still gets a fresh slug", async () => {
    const editor = site.actingAs("editor");
    const source = await site.factory.published.create({
      title: "Chain",
      slug: "chain",
    });
    const first = await editor.rpc.entry.duplicate({ id: source.id });

    const second = await editor.rpc.entry.duplicate({ id: first.id });

    expect(second.id).not.toBe(first.id);
    expect(second.slug).not.toBe(first.slug);
  });

  test("is refused to a member without the type's create capability", async () => {
    const member = await site.factory.member.create();
    const source = await site.factory.published.create({
      authorId: member.id,
      title: "Locked",
      slug: "locked-dup",
    });

    const duplicate = site
      .actingAs(member)
      .rpc.entry.duplicate({ id: source.id });

    await expect(duplicate).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:create" },
    });
  });

  test("answers not found for a missing source", async () => {
    const duplicate = site.actingAs("admin").rpc.entry.duplicate({ id: 9999 });

    await expect(duplicate).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("answers not found for another author's draft, leaking none of it", async () => {
    // Reading a non-published row needs edit_any or authorship plus edit_own,
    // so an author can't read a peer's draft.
    const peer = await site.factory.author.create();
    const secret = await site.factory.draft.create({
      authorId: peer.id,
      title: "Peer secret",
      slug: "peer-secret",
    });

    const duplicate = site
      .actingAs("author")
      .rpc.entry.duplicate({ id: secret.id });

    await expect(duplicate).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("answers not found for a reserved-type row such as a revision", async () => {
    const revision = await site.factory.entry.create({
      type: "revision",
      slug: "revision:1:abcdefghijklmnopqrstu",
      title: "snapshot",
    });

    const duplicate = site
      .actingAs("admin")
      .rpc.entry.duplicate({ id: revision.id });

    await expect(duplicate).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // A copy is not a new entity in the ADR 0026 sense: it carries the
  // source's meta as stored, so a key the source lacks stays absent.
  test("applies no field defaults to the copy", async () => {
    const source = await site.factory.published.create({
      meta: { other: "kept" },
    });

    const copy = await site
      .actingAs("editor")
      .rpc.entry.duplicate({ id: source.id });

    const persisted = await site.context.db.query.entries.findFirst({
      where: eq(entries.id, copy.id),
    });
    expect(persisted?.meta).toEqual({ other: "kept" });
  });
});
