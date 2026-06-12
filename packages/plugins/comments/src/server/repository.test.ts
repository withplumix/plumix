import { describe, expect, test } from "vitest";

import { createCommentsTestDb, ctxFor, seedPublishedPost } from "../test/db.js";
import { commentFactory } from "../test/factories.js";
import {
  clampParent,
  countByStatus,
  countPriorApproved,
  insertComment,
  listForModeration,
  purgeComment,
  setStatus,
  setStatusMany,
} from "./repository.js";

describe("countPriorApproved", () => {
  test("counts only approved comments for the given email", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    await seed.create({
      entryId: entry.id,
      authorEmail: "ada@example.test",
      status: "approved",
    });
    await seed.create({
      entryId: entry.id,
      authorEmail: "ada@example.test",
      status: "approved",
    });
    await seed.create({
      entryId: entry.id,
      authorEmail: "ada@example.test",
      status: "pending",
    });
    await seed.create({
      entryId: entry.id,
      authorEmail: "bob@example.test",
      status: "approved",
    });

    expect(await countPriorApproved(ctxFor(db), "ada@example.test")).toBe(2);
    expect(await countPriorApproved(ctxFor(db), "new@example.test")).toBe(0);
  });
});

describe("insertComment", () => {
  test("persists a comment and returns the stored row", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);

    const row = await insertComment(ctxFor(db), {
      entryId: entry.id,
      status: "pending",
      authorName: "Ada",
      authorEmail: "ada@example.test",
      bodyMd: "hi",
    });

    expect(row.id).toBeGreaterThan(0);
    expect(row.status).toBe("pending");
    expect(row.entryId).toBe(entry.id);
  });
});

describe("clampParent", () => {
  async function seedChain(
    db: Awaited<ReturnType<typeof createCommentsTestDb>>,
  ) {
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    const root = await seed.create({ entryId: entry.id, status: "approved" });
    const c1 = await seed.create({
      entryId: entry.id,
      status: "approved",
      parentId: root.id,
    });
    const c2 = await seed.create({
      entryId: entry.id,
      status: "approved",
      parentId: c1.id,
    });
    const c3 = await seed.create({
      entryId: entry.id,
      status: "approved",
      parentId: c2.id,
    });
    return { entry, root, c1, c2, c3 };
  }

  test("returns null for a root comment (no parent)", async () => {
    const db = await createCommentsTestDb();
    const { entry } = await seedChain(db);
    expect(await clampParent(ctxFor(db), null, entry.id, 3)).toBeNull();
  });

  test("keeps the parent when within the depth cap", async () => {
    const db = await createCommentsTestDb();
    const { entry, root, c1 } = await seedChain(db);
    expect(await clampParent(ctxFor(db), root.id, entry.id, 3)).toBe(root.id);
    expect(await clampParent(ctxFor(db), c1.id, entry.id, 3)).toBe(c1.id);
  });

  test("clamps a reply past the cap to the deepest allowed ancestor", async () => {
    const db = await createCommentsTestDb();
    const { entry, c2, c3 } = await seedChain(db);
    // cap 3: replying to the depth-3 comment (c3) clamps to the depth-2
    // ancestor (c2) so the new comment lands at depth 3, not 4.
    expect(await clampParent(ctxFor(db), c3.id, entry.id, 3)).toBe(c2.id);
  });

  test("rejects a parent from a different entry", async () => {
    const db = await createCommentsTestDb();
    const { root } = await seedChain(db);
    const other = await seedPublishedPost(db);
    expect(await clampParent(ctxFor(db), root.id, other.id, 3)).toBeNull();
  });

  test("rejects a non-existent parent", async () => {
    const db = await createCommentsTestDb();
    const { entry } = await seedChain(db);
    expect(await clampParent(ctxFor(db), 999_999, entry.id, 3)).toBeNull();
  });
});

describe("moderation repository ops", () => {
  test("listForModeration returns one status newest-first, paginated", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    await seed.create({
      entryId: entry.id,
      status: "pending",
      bodyMd: "older",
      createdAt: new Date("2026-06-01T00:00:00Z"),
    });
    await seed.create({
      entryId: entry.id,
      status: "pending",
      bodyMd: "newer",
      createdAt: new Date("2026-06-02T00:00:00Z"),
    });
    await seed.create({
      entryId: entry.id,
      status: "approved",
      bodyMd: "appr",
    });

    const page = await listForModeration(ctxFor(db), {
      status: "pending",
      limit: 10,
      offset: 0,
    });
    expect(page.map((c) => c.bodyMd)).toEqual(["newer", "older"]);
    expect(page[0]?.authorEmail).toContain("@"); // admin payload keeps email
  });

  test("countByStatus tallies every status", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    await seed.create({ entryId: entry.id, status: "pending" });
    await seed.create({ entryId: entry.id, status: "pending" });
    await seed.create({ entryId: entry.id, status: "approved" });
    await seed.create({ entryId: entry.id, status: "spam" });

    const counts = await countByStatus(ctxFor(db));
    expect(counts).toEqual({ pending: 2, approved: 1, spam: 1, trash: 0 });
  });

  test("setStatus transitions a comment", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const c = await commentFactory
      .transient({ db })
      .create({ entryId: entry.id, status: "pending" });

    const updated = await setStatus(ctxFor(db), c.id, "approved");
    expect(updated?.status).toBe("approved");
  });

  test("purgeComment deletes a leaf", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const c = await commentFactory
      .transient({ db })
      .create({ entryId: entry.id, status: "spam" });

    expect(await purgeComment(ctxFor(db), c.id)).toBe("deleted");
    expect(
      (
        await listForModeration(ctxFor(db), {
          status: "spam",
          limit: 10,
          offset: 0,
        })
      ).length,
    ).toBe(0);
  });

  test("purgeComment tombstones a comment that has replies", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    const parent = await seed.create({
      entryId: entry.id,
      status: "approved",
      authorName: "Real Name",
      authorEmail: "real@example.test",
      bodyMd: "to remove",
    });
    await seed.create({
      entryId: entry.id,
      status: "approved",
      parentId: parent.id,
    });

    expect(await purgeComment(ctxFor(db), parent.id)).toBe("tombstoned");
    const [kept] = await listForModeration(ctxFor(db), {
      status: "approved",
      limit: 10,
      offset: 0,
    });
    // The reply (newest) is first; the tombstoned parent is blanked.
    const tombstone = (
      await listForModeration(ctxFor(db), {
        status: "approved",
        limit: 10,
        offset: 0,
      })
    ).find((c) => c.id === parent.id);
    expect(tombstone?.bodyMd).toBe("");
    expect(tombstone?.authorEmail).toBe("");
    expect(kept).toBeDefined();
  });
});

describe("moderation list filters + bulk", () => {
  test("search matches author name, email, or body (escaped)", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    await seed.create({
      entryId: entry.id,
      status: "pending",
      authorName: "Ada Lovelace",
      bodyMd: "nothing",
    });
    await seed.create({
      entryId: entry.id,
      status: "pending",
      authorName: "Bob",
      authorEmail: "ada@example.test",
      bodyMd: "nothing",
    });
    await seed.create({
      entryId: entry.id,
      status: "pending",
      authorName: "Carol",
      bodyMd: "mentions ada in the body",
    });
    await seed.create({
      entryId: entry.id,
      status: "pending",
      authorName: "Dave",
      bodyMd: "unrelated",
    });

    const hits = await listForModeration(ctxFor(db), {
      status: "pending",
      limit: 50,
      offset: 0,
      search: "ada",
    });
    expect(hits).toHaveLength(3);
  });

  test("a literal % in the search is not a wildcard", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    await seed.create({
      entryId: entry.id,
      status: "pending",
      bodyMd: "100% sure",
    });
    await seed.create({
      entryId: entry.id,
      status: "pending",
      bodyMd: "anything",
    });

    const hits = await listForModeration(ctxFor(db), {
      status: "pending",
      limit: 50,
      offset: 0,
      search: "100%",
    });
    expect(hits).toHaveLength(1);
  });

  test("entryId narrows the queue to one entry", async () => {
    const db = await createCommentsTestDb();
    const a = await seedPublishedPost(db);
    const b = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    await seed.create({ entryId: a.id, status: "pending" });
    await seed.create({ entryId: b.id, status: "pending" });
    await seed.create({ entryId: b.id, status: "pending" });

    const hits = await listForModeration(ctxFor(db), {
      status: "pending",
      limit: 50,
      offset: 0,
      entryId: b.id,
    });
    expect(hits).toHaveLength(2);
  });

  test("setStatusMany transitions many comments and returns the count", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    const a = await seed.create({ entryId: entry.id, status: "pending" });
    const b = await seed.create({ entryId: entry.id, status: "pending" });
    await seed.create({ entryId: entry.id, status: "pending" });

    const changed = await setStatusMany(ctxFor(db), [a.id, b.id], "approved");
    expect(changed).toHaveLength(2);
    expect((await countByStatus(ctxFor(db))).approved).toBe(2);
  });

  test("setStatusMany with no ids is a no-op", async () => {
    const db = await createCommentsTestDb();
    expect(await setStatusMany(ctxFor(db), [], "approved")).toHaveLength(0);
  });
});
