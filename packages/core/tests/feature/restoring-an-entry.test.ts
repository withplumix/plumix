import { describe, expect, test } from "vitest";

import { entry } from "../../src/hooks/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

/** Each run of the restored handler, as `slug:status:userId`. */
const restored: string[] = [];

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.events.on(entry.restored, ({ entry }, handlerCtx) => {
      restored.push(
        `${entry.slug}:${entry.status}:${String(handlerCtx.user?.id)}`,
      );
    });
  },
});

const site = await testSite({ plugins: [posts] });

describe("restoring an entry from the trash", () => {
  test("returns it to a draft, running the restored handler once as the caller", async () => {
    const editor = await site.factory.editor.create();
    const target = await site.factory.trashed.create({
      authorId: editor.id,
      slug: "binned",
    });

    const result = await site
      .actingAs(editor)
      .rpc.entry.restore({ id: target.id });

    expect(result.status).toBe("draft");
    expect(restored.filter((run) => run.startsWith("binned:"))).toEqual([
      `binned:draft:${String(editor.id)}`,
    ]);
  });

  test("answers with the etag a save from the restored entry sends", async () => {
    const editor = site.actingAs("editor");
    const target = await site.factory.trashed.create({
      slug: "restored-then-saved",
    });
    const result = await editor.rpc.entry.restore({ id: target.id });

    const save = editor.rpc.entry.update({
      id: target.id,
      title: "Edited after restore",
      ifMatch: result.etag,
    });

    await expect(save).resolves.toMatchObject({
      title: "Edited after restore",
    });
  });

  test("is refused to an author, who lacks the post delete capability", async () => {
    const author = await site.factory.author.create();
    const target = await site.factory.trashed.create({
      authorId: author.id,
      slug: "locked",
    });

    const restore = site.actingAs(author).rpc.entry.restore({ id: target.id });

    await expect(restore).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:delete" },
    });
  });

  test("is refused for an entry not in the trash", async () => {
    const live = await site.factory.published.create({ slug: "live" });

    const restore = site.actingAs("editor").rpc.entry.restore({ id: live.id });

    await expect(restore).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "not_trashed" },
    });
  });
});
