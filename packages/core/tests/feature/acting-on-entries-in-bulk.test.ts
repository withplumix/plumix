import { describe, expect, test } from "vitest";

import { eq, inArray, like, or } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { entry } from "../../src/hooks/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [posts] });

describe("trashing entries in bulk", () => {
  test("trashes every entry named, emitting trashed for each", async () => {
    const a = await site.factory.published.create({ slug: "a" });
    const b = await site.factory.published.create({ slug: "b" });

    const result = await site
      .actingAs("editor")
      .rpc.entry.trashMany({ ids: [a.id, b.id] });

    expect(new Set(result.ids)).toEqual(new Set([a.id, b.id]));
    expect(site.events.emitted(entry.trashed)).toHaveLength(2);
    const rows = await site.context.db.query.entries.findMany({
      where: inArray(entries.id, [a.id, b.id]),
    });
    expect(rows.map((row) => row.status)).toEqual(["trash", "trash"]);
  });

  test("skips an entry already in the trash", async () => {
    const live = await site.factory.published.create({ slug: "live" });
    const gone = await site.factory.trashed.create({ slug: "gone" });

    const result = await site
      .actingAs("editor")
      .rpc.entry.trashMany({ ids: [live.id, gone.id] });

    expect(result.ids).toEqual([live.id]);
  });

  test("refuses the whole batch over one entry the caller may not trash, trashing none", async () => {
    const author = await site.factory.author.create();
    const mine = await site.factory.published.create({
      authorId: author.id,
      slug: "mine",
    });

    const trash = site.actingAs(author).rpc.entry.trashMany({ ids: [mine.id] });

    await expect(trash).rejects.toMatchObject({ code: "FORBIDDEN" });
    const row = await site.context.db.query.entries.findFirst({
      where: eq(entries.id, mine.id),
    });
    expect(row?.status).toBe("published");
  });

  test("acts once on an id named twice, emitting trashed once", async () => {
    const target = await site.factory.published.create({ slug: "dup" });

    const result = await site
      .actingAs("editor")
      .rpc.entry.trashMany({ ids: [target.id, target.id] });

    expect(result.ids).toEqual([target.id]);
    expect(site.events.emitted(entry.trashed)).toHaveLength(1);
  });

  test("answers not found when any id is missing", async () => {
    const real = await site.factory.published.create({ slug: "real" });

    const trash = site
      .actingAs("admin")
      .rpc.entry.trashMany({ ids: [real.id, 9999] });

    await expect(trash).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("restoring entries in bulk", () => {
  test("restores each trashed entry to a draft", async () => {
    const a = await site.factory.trashed.create({ slug: "ra" });
    const b = await site.factory.trashed.create({ slug: "rb" });

    const result = await site
      .actingAs("editor")
      .rpc.entry.restoreMany({ ids: [a.id, b.id] });

    expect(new Set(result.ids)).toEqual(new Set([a.id, b.id]));
    const rows = await site.context.db.query.entries.findMany({
      where: inArray(entries.id, [a.id, b.id]),
    });
    expect(rows.map((row) => row.status)).toEqual(["draft", "draft"]);
  });

  test("skips an entry not in the trash", async () => {
    const trashed = await site.factory.trashed.create({ slug: "t" });
    const live = await site.factory.published.create({ slug: "l" });

    const result = await site
      .actingAs("editor")
      .rpc.entry.restoreMany({ ids: [trashed.id, live.id] });

    expect(result.ids).toEqual([trashed.id]);
  });
});

describe("deleting entries permanently in bulk", () => {
  test("deletes each trashed entry with its revisions", async () => {
    const a = await site.factory.trashed.create({ slug: "da" });
    const b = await site.factory.trashed.create({ slug: "db" });
    await site.factory.entry.create({
      type: "revision",
      slug: `revision:${String(a.id)}:abcdefghijklmnopqrstu`,
    });
    await site.factory.entry.create({
      type: "revision",
      slug: `revision:${String(b.id)}:abcdefghijklmnopqrstu`,
    });

    const result = await site
      .actingAs("editor")
      .rpc.entry.deletePermanentMany({ ids: [a.id, b.id] });

    expect(new Set(result.ids)).toEqual(new Set([a.id, b.id]));
    const leftovers = await site.context.db.query.entries.findMany({
      where: or(
        inArray(entries.id, [a.id, b.id]),
        like(entries.slug, `revision:${String(a.id)}:%`),
        like(entries.slug, `revision:${String(b.id)}:%`),
      ),
    });
    expect(leftovers).toEqual([]);
  });

  test("refuses the whole batch when any entry is not in the trash", async () => {
    const trashed = await site.factory.trashed.create({ slug: "tt" });
    const live = await site.factory.published.create({ slug: "ll" });

    const deletion = site
      .actingAs("editor")
      .rpc.entry.deletePermanentMany({ ids: [trashed.id, live.id] });

    await expect(deletion).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "not_trashed" },
    });
  });
});
