import { describe, expect, test } from "vitest";

import { createCommentsTestDb, ctxFor, seedPublishedPost } from "../test/db.js";
import { commentFactory } from "../test/factories.js";
import {
  clampParent,
  countPriorApproved,
  insertComment,
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
