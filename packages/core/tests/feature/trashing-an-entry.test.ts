import { describe, expect, test } from "vitest";

import { entry } from "../../src/events-and-filters/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

/** Each run of a trashed handler, as `slug:userId`. */
const postTrashed: string[] = [];
const entryTrashed: string[] = [];

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.events.on(entry.for("post").trashed, ({ entry }, handlerCtx) => {
      postTrashed.push(`${entry.slug}:${String(handlerCtx.user?.id)}`);
    });
    ctx.events.on(entry.trashed, ({ entry }, handlerCtx) => {
      entryTrashed.push(`${entry.slug}:${String(handlerCtx.user?.id)}`);
    });
  },
});

const site = await testSite({ plugins: [posts] });

function runsFor(runs: readonly string[], slug: string): string[] {
  return runs.filter((run) => run.startsWith(`${slug}:`));
}

describe("trashing an entry", () => {
  test("lands while another editor holds its edit lease, since it is a system write", async () => {
    const ada = await site.factory.editor.create({ name: "Ada" });
    const target = await site.factory.published.create({ authorId: ada.id });
    await site.actingAs(ada).rpc.entry.lease.acquire({ id: target.id });

    const result = await site
      .actingAs("editor")
      .rpc.entry.trash({ id: target.id });

    expect(result.status).toBe("trash");
  });

  test("moves it to the trash, running the trashed handler once as the caller", async () => {
    const editor = await site.factory.editor.create();
    const target = await site.factory.published.create({
      authorId: editor.id,
      slug: "soft",
    });

    const result = await site
      .actingAs(editor)
      .rpc.entry.trash({ id: target.id });

    expect(result.status).toBe("trash");
    expect(runsFor(entryTrashed, "soft")).toEqual([
      `soft:${String(editor.id)}`,
    ]);
  });

  // Plugins can target the default entry type by name with
  // `entry.for("post")`, not only the unscoped event plus a type check.
  test("runs a handler scoped to the post type and one for every entry, each once", async () => {
    const editor = await site.factory.editor.create();
    const row = await site.factory.published.create({
      slug: "scoped-and-generic",
    });

    await site.actingAs(editor).rpc.entry.trash({ id: row.id });

    expect(runsFor(postTrashed, "scoped-and-generic")).toHaveLength(1);
    expect(runsFor(entryTrashed, "scoped-and-generic")).toHaveLength(1);
  });

  test("answers with the etag a save from the trashed entry sends", async () => {
    const editor = site.actingAs("editor");
    const target = await site.factory.published.create({
      slug: "trashed-then-saved",
    });
    const result = await editor.rpc.entry.trash({ id: target.id });

    const save = editor.rpc.entry.update({
      id: target.id,
      title: "Edited in the trash",
      ifMatch: result.etag,
    });

    await expect(save).resolves.toMatchObject({ title: "Edited in the trash" });
  });

  test("is refused to an author, who lacks the post delete capability", async () => {
    const author = await site.factory.author.create();
    const target = await site.factory.published.create({
      authorId: author.id,
      slug: "keep",
    });

    const trash = site.actingAs(author).rpc.entry.trash({ id: target.id });

    await expect(trash).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:delete" },
    });
  });

  test("an editor trashes another author's entry", async () => {
    const other = await site.factory.author.create();
    const target = await site.factory.published.create({
      authorId: other.id,
      slug: "others",
    });

    const result = await site
      .actingAs("editor")
      .rpc.entry.trash({ id: target.id });

    expect(result.status).toBe("trash");
  });

  test("an entry already in the trash stays there without emitting trashed again", async () => {
    const editor = site.actingAs("editor");
    const target = await site.factory.published.create({ slug: "twice" });
    await editor.rpc.entry.trash({ id: target.id });

    const again = await editor.rpc.entry.trash({ id: target.id });

    expect(again.status).toBe("trash");
    expect(site.events.emitted(entry.trashed)).toHaveLength(1);
  });

  test("answers not found for a missing entry", async () => {
    const trash = site.actingAs("admin").rpc.entry.trash({ id: 9999 });

    await expect(trash).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
