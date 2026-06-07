import { describe, expect, test, vi } from "vitest";

import type { Entry } from "../../../db/schema/entries.js";
import { eq, inArray, like, or } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("entry.trashMany", () => {
  test("editor trashes several entries in one call; trashed fires per entry", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const a = await h.factory.published.create({
      authorId: h.user.id,
      slug: "a",
    });
    const b = await h.factory.published.create({
      authorId: h.user.id,
      slug: "b",
    });

    const onTrash = vi.fn<(post: Entry) => void>();
    h.hooks.addAction("entry:trashed", onTrash);

    const result = await h.client.entry.trashMany({ ids: [a.id, b.id] });
    expect(new Set(result.ids)).toEqual(new Set([a.id, b.id]));
    expect(onTrash).toHaveBeenCalledTimes(2);

    const rows = await h.db.query.entries.findMany({
      where: inArray(entries.id, [a.id, b.id]),
    });
    expect(rows.every((r) => r.status === "trash")).toBe(true);
  });

  test("already-trashed ids are skipped idempotently", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const live = await h.factory.published.create({
      authorId: h.user.id,
      slug: "live",
    });
    const gone = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "gone",
    });
    const result = await h.client.entry.trashMany({ ids: [live.id, gone.id] });
    expect(result.ids).toEqual([live.id]);
  });

  test("fail-all: a forbidden row rejects the whole batch, nothing is trashed", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const mine = await h.factory.published.create({
      authorId: h.user.id,
      slug: "mine",
    });
    await expect(
      h.client.entry.trashMany({ ids: [mine.id] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const row = await h.db.query.entries.findFirst({
      where: eq(entries.id, mine.id),
    });
    expect(row?.status).toBe("published");
  });

  test("duplicate ids act once — no double-fire, no inflated result", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const target = await h.factory.published.create({
      authorId: h.user.id,
      slug: "dup",
    });
    const onTrash = vi.fn();
    h.hooks.addAction("entry:trashed", onTrash);
    const result = await h.client.entry.trashMany({
      ids: [target.id, target.id],
    });
    expect(result.ids).toEqual([target.id]);
    expect(onTrash).toHaveBeenCalledTimes(1);
  });

  test("404 when any id is missing", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const real = await h.factory.published.create({
      authorId: h.user.id,
      slug: "real",
    });
    await expect(
      h.client.entry.trashMany({ ids: [real.id, 9999] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("entry.restoreMany", () => {
  test("restores trashed entries to draft", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const a = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "ra",
    });
    const b = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "rb",
    });
    const result = await h.client.entry.restoreMany({ ids: [a.id, b.id] });
    expect(new Set(result.ids)).toEqual(new Set([a.id, b.id]));
    const rows = await h.db.query.entries.findMany({
      where: inArray(entries.id, [a.id, b.id]),
    });
    expect(rows.every((r) => r.status === "draft")).toBe(true);
  });

  test("non-trashed ids are skipped", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const trashed = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "t",
    });
    const live = await h.factory.published.create({
      authorId: h.user.id,
      slug: "l",
    });
    const result = await h.client.entry.restoreMany({
      ids: [trashed.id, live.id],
    });
    expect(result.ids).toEqual([trashed.id]);
  });
});

describe("entry.deletePermanentMany", () => {
  test("permanently deletes trashed entries plus their revision/autosave rows", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const a = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "da",
    });
    const b = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "db",
    });
    for (const t of [a, b]) {
      await h.factory.entry.create({
        authorId: h.user.id,
        type: "revision",
        slug: `revision:${String(t.id)}:abcdefghijklmnopqrstu`,
      });
    }

    const result = await h.client.entry.deletePermanentMany({
      ids: [a.id, b.id],
    });
    expect(new Set(result.ids)).toEqual(new Set([a.id, b.id]));

    const leftovers = await h.db.query.entries.findMany({
      where: or(
        inArray(entries.id, [a.id, b.id]),
        like(entries.slug, `revision:${String(a.id)}:%`),
        like(entries.slug, `revision:${String(b.id)}:%`),
      ),
    });
    expect(leftovers).toEqual([]);
  });

  test("rejects when any id is not trashed (fail-all)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const trashed = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "tt",
    });
    const live = await h.factory.published.create({
      authorId: h.user.id,
      slug: "ll",
    });
    await expect(
      h.client.entry.deletePermanentMany({ ids: [trashed.id, live.id] }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "not_trashed" },
    });
  });
});
