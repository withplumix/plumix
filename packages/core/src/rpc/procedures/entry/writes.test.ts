import { describe, expect, test } from "vitest";

import { ConflictError } from "../../../db/concurrency.js";
import { acquireEditLease, LockedError } from "../../../db/edit-lease.js";
import { definePlugin } from "../../../plugin/define.js";
import { testSite } from "../../../test/site.js";

const site = await testSite({
  plugins: [
    definePlugin("posts", {
      setup: (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
        ctx.registerEntryMetaBox("test-seo", {
          label: "SEO",
          entryTypes: ["post"],
          fields: [
            {
              key: "meta_title",
              label: "Meta title",
              type: "string",
              inputType: "text",
            },
          ],
        });
      },
    }),
  ],
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

describe("ctx.entries.update", () => {
  test("a save from a stale copy is refused and leaves the entry as the newer save left it", async () => {
    const editor = await site.factory.editor.create();
    const entry = await site.factory.draft.create({
      authorId: editor.id,
      title: "Original",
    });
    const ctx = site.actingAs(editor).context;
    await ctx.entries.update({
      id: entry.id,
      ifMatch: entry.updatedAt,
      title: "Newer",
    });

    await expect(
      ctx.entries.update({
        id: entry.id,
        ifMatch: entry.updatedAt,
        title: "Stale",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    const row = await site.context.db.query.entries.findFirst({
      where: (entries, { eq }) => eq(entries.id, entry.id),
    });
    expect(row?.title).toBe("Newer");
  });

  test("a save is refused while another user holds the entry's edit lease", async () => {
    const editor = await site.factory.editor.create();
    const ada = await site.factory.editor.create();
    const entry = await site.factory.draft.create({ authorId: ada.id });
    await acquireEditLease(
      site.context.db,
      { kind: "entry", id: entry.id },
      { userId: ada.id, surface: "admin" },
    );

    await expect(
      site.actingAs(editor).context.entries.update({
        id: entry.id,
        ifMatch: entry.updatedAt,
        title: "Mine",
      }),
    ).rejects.toBeInstanceOf(LockedError);
  });

  test("stored meta lands in the bag as given, though no field declares it", async () => {
    const editor = await site.factory.editor.create();
    const entry = await site.factory.draft.create({ authorId: editor.id });

    const written = await site.actingAs(editor).context.entries.update({
      id: entry.id,
      ifMatch: entry.updatedAt,
      storedMeta: { checksum: "abc" },
    });

    expect(written.entry.meta).toMatchObject({ checksum: "abc" });
  });

  test("a null in stored meta clears that key", async () => {
    const editor = await site.factory.editor.create();
    const entry = await site.factory.draft.create({
      authorId: editor.id,
      meta: { checksum: "abc", size: 3 },
    });

    const written = await site.actingAs(editor).context.entries.update({
      id: entry.id,
      ifMatch: entry.updatedAt,
      storedMeta: { checksum: null },
    });

    expect(written.entry.meta).toEqual({ size: 3 });
  });

  test("stored meta alongside a cleared field still clears it", async () => {
    const editor = await site.factory.editor.create();
    const entry = await site.factory.draft.create({
      authorId: editor.id,
      meta: { meta_title: "old" },
    });

    const written = await site.actingAs(editor).context.entries.update({
      id: entry.id,
      ifMatch: entry.updatedAt,
      meta: { meta_title: null },
      storedMeta: { checksum: "abc" },
    });

    expect(written.entry.meta).toEqual({ checksum: "abc" });
  });
});

describe("ctx.entries — a principal without edit_layout", () => {
  const text = (id: string) => ({
    id,
    name: "core/rich-text",
    attrs: { body: "<p>Hi</p>" },
  });
  const v2 = (blocks: readonly unknown[]) => ({
    version: "plumix.v2" as const,
    blocks,
  });

  test("update refuses a layout change, naming the node", async () => {
    const contributor = await site.factory.user.create({ role: "contributor" });
    const entry = await site.factory.draft.create({
      authorId: contributor.id,
      content: v2([text("p1")]),
    });

    await expect(
      site.actingAs(contributor).context.entries.update({
        id: entry.id,
        ifMatch: entry.updatedAt,
        content: v2([text("p1"), text("p2")]),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({ code: "layout_change", path: "blocks[1]" }),
        ],
      },
    });
  });

  test("create refuses content holding a block", async () => {
    const contributor = await site.factory.user.create({ role: "contributor" });

    await expect(
      site.actingAs(contributor).context.entries.create({
        type: "post",
        title: "Hello",
        slug: "hello",
        status: "draft",
        sortOrder: 0,
        content: v2([text("p1")]),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({ code: "layout_change", path: "blocks[0]" }),
        ],
      },
    });
  });
});

describe("ctx.entries.create", () => {
  test("the entry is authored by the context's principal", async () => {
    const ada = await site.factory.editor.create();

    const written = await site.actingAs(ada).context.entries.create({
      type: "post",
      slug: "by-ada",
      status: "draft",
      sortOrder: 0,
    });

    expect(written.entry.authorId).toBe(ada.id);
  });

  test("a reserved internal type is refused", async () => {
    const editor = await site.factory.editor.create();

    await expect(
      site.actingAs(editor).context.entries.create({
        type: "revision",
        slug: "smuggled",
        status: "draft",
        sortOrder: 0,
      }),
    ).rejects.toMatchObject({ data: { reason: "reserved_type" } });
  });

  test("a context with no principal is refused", async () => {
    await expect(
      site.context.entries.create({
        type: "post",
        slug: "by-nobody",
        status: "draft",
        sortOrder: 0,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("ctx.entries.delete", () => {
  test("deletes an entry that was never trashed", async () => {
    const editor = await site.factory.editor.create();
    const entry = await site.factory.published.create({ authorId: editor.id });

    await site.actingAs(editor).context.entries.delete(entry.id);

    expect(
      await site.context.db.query.entries.findFirst({
        where: (entries, { eq }) => eq(entries.id, entry.id),
      }),
    ).toBeUndefined();
  });
});
