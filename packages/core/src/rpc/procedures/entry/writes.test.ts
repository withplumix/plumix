import { describe, expect, test } from "vitest";

import { withUser } from "../../../auth/with-user.js";
import { ConflictError } from "../../../db/concurrency.js";
import { acquireEditLease, LockedError } from "../../../db/edit-lease.js";
import { editorUser } from "../../../test/factories.js";
import { authedCtx, createRpcHarness } from "../../../test/rpc.js";

describe("ctx.entries.update", () => {
  test("a save from a stale copy is refused and leaves the entry as the newer save left it", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const entry = await h.factory.draft.create({
      authorId: h.user.id,
      title: "Original",
    });
    const ctx = authedCtx(h);
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
    const row = await h.db.query.entries.findFirst({
      where: (entries, { eq }) => eq(entries.id, entry.id),
    });
    expect(row?.title).toBe("Newer");
  });

  test("a save is refused while another user holds the entry's edit lease", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const ada = await editorUser.transient({ db: h.db }).create({});
    const entry = await h.factory.draft.create({ authorId: ada.id });
    await acquireEditLease(
      h.db,
      { kind: "entry", id: entry.id },
      { userId: ada.id, surface: "admin" },
    );

    await expect(
      authedCtx(h).entries.update({
        id: entry.id,
        ifMatch: entry.updatedAt,
        title: "Mine",
      }),
    ).rejects.toBeInstanceOf(LockedError);
  });

  test("stored meta lands in the bag as given, though no field declares it", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const entry = await h.factory.draft.create({ authorId: h.user.id });

    const written = await authedCtx(h).entries.update({
      id: entry.id,
      ifMatch: entry.updatedAt,
      storedMeta: { checksum: "abc" },
    });

    expect(written.entry.meta).toMatchObject({ checksum: "abc" });
  });
});

describe("ctx.entries.create", () => {
  test("the entry is authored by the context's principal", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const ada = await editorUser.transient({ db: h.db }).create({});

    const written = await withUser(h.context, {
      id: ada.id,
      email: ada.email,
      role: ada.role,
      meta: {},
    }).entries.create({
      type: "post",
      slug: "by-ada",
      status: "draft",
      sortOrder: 0,
    });

    expect(written.entry.authorId).toBe(ada.id);
  });

  test("a context with no principal is refused", async () => {
    const h = await createRpcHarness();

    await expect(
      h.context.entries.create({
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
    const h = await createRpcHarness({ authAs: "editor" });
    const entry = await h.factory.published.create({ authorId: h.user.id });

    await authedCtx(h).entries.delete(entry.id);

    expect(
      await h.db.query.entries.findFirst({
        where: (entries, { eq }) => eq(entries.id, entry.id),
      }),
    ).toBeUndefined();
  });
});
