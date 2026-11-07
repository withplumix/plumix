import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { eq } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { entryChanges } from "../../src/db/schema/entry_changes.js";
import { entry } from "../../src/events-and-filters/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryMetaBox("seo", {
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
    // A plugin's own write, landing after the save read the entry.
    ctx.filters.add(entry.beforeSave, async (row, _input, { db }) => {
      if (row.slug === "written-mid-save") {
        await db
          .update(entries)
          .set({ title: "theirs" })
          .where(eq(entries.slug, "written-mid-save"));
      }
      if (row.slug === "deleted-mid-save") {
        await db.delete(entries).where(eq(entries.slug, "deleted-mid-save"));
      }
      return row;
    });
  },
});

const site = await testSite({ plugins: [posts] });

describe("saving an entry", () => {
  test("from the current copy lands and answers with the next etag", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
    const rpc = site.actingAs(author).rpc;
    const loaded = await rpc.entry.get({ id: own.id });

    const updated = await rpc.entry.update({
      id: own.id,
      title: "renamed",
      ifMatch: loaded.etag,
    });

    expect(updated).toMatchObject({ title: "renamed", etag: "4102444801" });
  });

  test("from a stale copy is refused with the entry's current etag", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      updatedAt: new Date("2026-10-18T12:00:05Z"),
    });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      title: "lost-race",
      ifMatch: etagOf(new Date("2026-10-18T12:00:00Z")),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: {
        reason: "etag_mismatch",
        etag: "1792324805",
        updatedAt: new Date("2026-10-18T12:00:05Z"),
      },
    });
  });

  test("without ifMatch is refused with where to find the etag", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    // @ts-expect-error -- the caller left out its copy's token
    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      title: "no-token",
    });

    await expect(update).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: {
        issues: [
          { message: "Send the entry's `etag` from `entry.get` as `ifMatch`" },
        ],
      },
    });
  });

  test("from a stale copy with an empty patch is still refused", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      ifMatch: etagOf(new Date("2020-01-01T00:00:00Z")),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch" },
    });
  });

  test("from a stale copy by a caller who may not edit is forbidden, not a conflict, so it reveals nothing", async () => {
    const member = await site.factory.member.create();
    const own = await site.factory.draft.create({ authorId: member.id });

    const update = site.actingAs(member).rpc.entry.update({
      id: own.id,
      title: "x",
      ifMatch: etagOf(new Date("2020-01-01T00:00:00Z")),
    });

    await expect(update).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:edit_any" },
    });
  });

  test("conflicts when a write lands after the save read the entry", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      slug: "written-mid-save",
    });
    const rpc = site.actingAs(author).rpc;

    const update = rpc.entry.update({
      id: own.id,
      title: "mine",
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch" },
    });
    expect(await rpc.entry.get({ id: own.id })).toMatchObject({
      title: "theirs",
    });
  });

  test("twice in the same second leaves different etags, and the first one's is refused", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
    const rpc = site.actingAs(author).rpc;
    const first = await rpc.entry.update({
      id: own.id,
      title: "first",
      ifMatch: etagOf(own.updatedAt),
    });
    const second = await rpc.entry.update({
      id: own.id,
      title: "second",
      ifMatch: first.etag,
    });

    const update = rpc.entry.update({
      id: own.id,
      title: "from the first copy",
      ifMatch: first.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: "4102444802" },
    });
    expect([first.etag, second.etag]).toEqual(["4102444801", "4102444802"]);
  });

  test("chained under a frozen clock gives each save a later etag", async () => {
    site.freezeTime("2026-10-18T12:00:00Z");
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      updatedAt: new Date("2026-10-18T12:00:00Z"),
    });
    const rpc = site.actingAs(author).rpc;

    const first = await rpc.entry.update({
      id: own.id,
      sortOrder: 1,
      ifMatch: "1792324800",
    });
    const second = await rpc.entry.update({
      id: own.id,
      sortOrder: 2,
      ifMatch: first.etag,
    });
    const third = await rpc.entry.update({
      id: own.id,
      sortOrder: 3,
      ifMatch: second.etag,
    });

    expect([first.etag, second.etag, third.etag]).toEqual([
      "1792324801",
      "1792324802",
      "1792324803",
    ]);
  });

  test("from a copy taken before a system write conflicts, since the write moved the etag", async () => {
    const editor = await site.factory.editor.create();
    const own = await site.factory.draft.create({
      authorId: editor.id,
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
    const rpc = site.actingAs(editor).rpc;
    await rpc.entry.trash({ id: own.id });

    const update = rpc.entry.update({
      id: own.id,
      title: "from before the trash",
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: "4102444801" },
    });
  });

  test("refused leaves the entry's meta, terms and change feed as they were", async () => {
    const editor = await site.factory.editor.create();
    const category = await site.factory.category.create({ slug: "news" });
    const own = await site.factory.draft.create({
      authorId: editor.id,
      meta: { meta_title: "kept" },
      updatedAt: new Date("2026-10-18T12:00:05Z"),
    });
    await site.context.db.delete(entryChanges);
    const rpc = site.actingAs(editor).rpc;

    const update = rpc.entry.update({
      id: own.id,
      meta: { meta_title: "lost" },
      terms: { category: [category.id] },
      ifMatch: etagOf(new Date("2026-10-18T12:00:00Z")),
    });

    await expect(update).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await rpc.entry.get({ id: own.id })).toMatchObject({
      meta: { meta_title: "kept" },
      terms: {},
    });
    expect(await site.context.db.select().from(entryChanges)).toEqual([]);
  });

  test("of an entry deleted mid-save is reported as a failed update, not a conflict", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      slug: "deleted-mid-save",
    });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      title: "mine",
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "update_failed" },
    });
  });

  test("that changes only meta runs no entry.beforeSave filter", async () => {
    const editor = await site.factory.editor.create();
    const own = await site.factory.draft.create({ authorId: editor.id });

    await site.actingAs(editor).rpc.entry.update({
      id: own.id,
      meta: { meta_title: "only meta" },
      ifMatch: etagOf(own.updatedAt),
    });

    site.filters.assertNotApplied(entry.beforeSave);
  });

  test("that changes only meta emits no entry.updated", async () => {
    const editor = await site.factory.editor.create();
    const own = await site.factory.draft.create({ authorId: editor.id });

    await site.actingAs(editor).rpc.entry.update({
      id: own.id,
      meta: { meta_title: "only meta" },
      ifMatch: etagOf(own.updatedAt),
    });

    site.events.assertNotEmitted(entry.updated);
  });

  test("from one copy in eight racing saves lands exactly once", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });
    const ifMatch = etagOf(own.updatedAt);
    const rpc = site.actingAs(author).rpc;

    const outcomes = await Promise.allSettled([
      rpc.entry.update({ id: own.id, title: "a", ifMatch }),
      rpc.entry.update({ id: own.id, title: "b", ifMatch }),
      rpc.entry.update({ id: own.id, title: "c", ifMatch }),
      rpc.entry.update({ id: own.id, title: "d", ifMatch }),
      rpc.entry.update({ id: own.id, title: "e", ifMatch }),
      rpc.entry.update({ id: own.id, title: "f", ifMatch }),
      rpc.entry.update({ id: own.id, title: "g", ifMatch }),
      rpc.entry.update({ id: own.id, title: "h", ifMatch }),
    ]);

    const conflict = {
      status: "rejected",
      reason: { code: "CONFLICT", data: { reason: "etag_mismatch" } },
    };
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toMatchObject([
      conflict,
      conflict,
      conflict,
      conflict,
      conflict,
      conflict,
      conflict,
    ]);
  });
});
