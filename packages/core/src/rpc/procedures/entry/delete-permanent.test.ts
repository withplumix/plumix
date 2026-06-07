import { describe, expect, test, vi } from "vitest";

import type { Entry } from "../../../db/schema/entries.js";
import { eq, like, or } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("entry.deletePermanent", () => {
  test("editor permanently deletes a trashed entry: row, revisions, and autosaves are gone and deleted action fires", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const target = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "gone-for-good",
    });
    await h.factory.entry.create({
      authorId: h.user.id,
      type: "revision",
      slug: `revision:${String(target.id)}:abcdefghijklmnopqrstu`,
    });
    await h.factory.entry.create({
      authorId: h.user.id,
      type: "autosave",
      slug: `autosave:${String(target.id)}:${String(h.user.id)}`,
    });

    const onDelete = vi.fn<(post: Entry) => void>();
    h.hooks.addAction("entry:deleted", onDelete);

    const result = await h.client.entry.deletePermanent({ id: target.id });
    expect(result.id).toBe(target.id);
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: target.id }),
    );

    const leftovers = await h.db.query.entries.findMany({
      where: or(
        eq(entries.id, target.id),
        like(entries.slug, `revision:${String(target.id)}:%`),
        like(entries.slug, `autosave:${String(target.id)}:%`),
      ),
    });
    expect(leftovers).toEqual([]);
  });

  test("a live entry cannot be permanently deleted — it must be trashed first", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const live = await h.factory.published.create({
      authorId: h.user.id,
      slug: "still-live",
    });
    await expect(
      h.client.entry.deletePermanent({ id: live.id }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "not_trashed" },
    });
  });

  test("contributor cannot permanently delete (no post:delete cap)", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const target = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "shielded",
    });
    await expect(
      h.client.entry.deletePermanent({ id: target.id }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:delete" },
    });
  });
});
