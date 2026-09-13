import { describe, expect, test, vi } from "vitest";

import type { AppContext } from "../../../context/app.js";
import type { Entry } from "../../../db/schema/entries.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("entry.restore", () => {
  test("editor restores a trashed entry: status returns to draft and restored action fires", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const target = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "binned",
    });

    const onRestore = vi.fn<(post: Entry, ctx: AppContext) => void>();
    h.hooks.addAction("entry:restored", onRestore);

    const result = await h.client.entry.restore({ id: target.id });
    expect(result.status).toBe("draft");
    expect(onRestore).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: target.id, status: "draft" }),
      expect.anything(),
    );
    expect(onRestore.mock.calls[0]?.[1].user?.id).toBe(h.user.id);
  });

  test("contributor cannot restore (no post:delete cap)", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const target = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "locked",
    });
    await expect(
      h.client.entry.restore({ id: target.id }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:delete" },
    });
  });

  test("restoring an entry that is not in the trash is rejected", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const live = await h.factory.published.create({
      authorId: h.user.id,
      slug: "live",
    });
    await expect(h.client.entry.restore({ id: live.id })).rejects.toMatchObject(
      {
        code: "CONFLICT",
        data: { reason: "not_trashed" },
      },
    );
  });
});
