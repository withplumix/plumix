import { describe, expect, test, vi } from "vitest";

import type { Entry } from "../../../db/schema/entries.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("entry.trash", () => {
  test("editor can soft-delete: status transitions to trash and trashed action fires", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const target = await h.factory.published.create({
      authorId: h.user.id,
      slug: "soft",
    });

    const onTrash = vi.fn<(post: Entry) => void>();
    h.hooks.addAction("entry:trashed", onTrash);

    const result = await h.client.entry.trash({ id: target.id });
    expect(result.status).toBe("trash");
    expect(onTrash).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: target.id }),
    );
  });

  test("contributor cannot trash (no post:delete cap)", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const target = await h.factory.published.create({
      authorId: h.user.id,
      slug: "keep",
    });
    await expect(h.client.entry.trash({ id: target.id })).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
        data: { capability: "post:delete" },
      },
    );
  });

  test("editor can trash someone else's post (edit_any is granted by role)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const other = await h.factory.author.create();
    const target = await h.factory.published.create({
      authorId: other.id,
      slug: "others",
    });
    const result = await h.client.entry.trash({ id: target.id });
    expect(result.status).toBe("trash");
  });

  test("already-trashed is a no-op and does not re-fire the action", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const target = await h.factory.published.create({
      authorId: h.user.id,
      slug: "twice",
    });
    await h.client.entry.trash({ id: target.id });

    const onTrash = vi.fn();
    h.hooks.addAction("entry:trashed", onTrash);
    const again = await h.client.entry.trash({ id: target.id });
    expect(again.status).toBe("trash");
    expect(onTrash).not.toHaveBeenCalled();
  });

  test("404 for a missing row", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(h.client.entry.trash({ id: 9999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
