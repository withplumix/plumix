import { describe, expect, test } from "vitest";

import { createCommentsTestDb, ctxFor, seedPublishedPost } from "../test/db.js";
import { commentFactory } from "../test/factories.js";
import { countPriorApproved, insertComment } from "./repository.js";

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
