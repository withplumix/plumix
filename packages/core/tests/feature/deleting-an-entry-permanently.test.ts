import { describe, expect, test } from "vitest";

import { eq, like, or } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { entry } from "../../src/events-and-filters/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

/** Each run of the deleted handler, as `slug:userId`. */
const deleted: string[] = [];

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.events.on(entry.deleted, ({ entry }, handlerCtx) => {
      deleted.push(`${entry.slug}:${String(handlerCtx.user?.id)}`);
    });
  },
});

const site = await testSite({ plugins: [posts] });

describe("deleting an entry permanently", () => {
  test("removes a trashed entry with its revisions and autosaves, running the deleted handler once as the caller", async () => {
    const editor = await site.factory.editor.create();
    const target = await site.factory.trashed.create({
      authorId: editor.id,
      slug: "gone-for-good",
    });
    await site.factory.entry.create({
      authorId: editor.id,
      type: "revision",
      slug: `revision:${String(target.id)}:abcdefghijklmnopqrstu`,
    });
    await site.factory.entry.create({
      authorId: editor.id,
      type: "autosave",
      slug: `autosave:${String(target.id)}:${String(editor.id)}`,
    });

    const result = await site
      .actingAs(editor)
      .rpc.entry.deletePermanent({ id: target.id });

    expect(result.id).toBe(target.id);
    expect(deleted.filter((run) => run.startsWith("gone-for-good:"))).toEqual([
      `gone-for-good:${String(editor.id)}`,
    ]);
    const leftovers = await site.context.db.query.entries.findMany({
      where: or(
        eq(entries.id, target.id),
        like(entries.slug, `revision:${String(target.id)}:%`),
        like(entries.slug, `autosave:${String(target.id)}:%`),
      ),
    });
    expect(leftovers).toEqual([]);
  });

  test("is refused for a live entry, which must be trashed first", async () => {
    const live = await site.factory.published.create({ slug: "still-live" });

    const deletion = site
      .actingAs("editor")
      .rpc.entry.deletePermanent({ id: live.id });

    await expect(deletion).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "not_trashed" },
    });
  });

  test("is refused to an author, who lacks the post delete capability", async () => {
    const author = await site.factory.author.create();
    const target = await site.factory.trashed.create({
      authorId: author.id,
      slug: "shielded",
    });

    const deletion = site
      .actingAs(author)
      .rpc.entry.deletePermanent({ id: target.id });

    await expect(deletion).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:delete" },
    });
  });
});
