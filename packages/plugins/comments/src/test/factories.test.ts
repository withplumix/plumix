import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { comments } from "../db/schema.js";
import { createCommentsTestDb, seedPublishedPost } from "./db.js";
import { commentFactory } from "./factories.js";

describe("commentFactory", () => {
  test("seeds a comment row attached to an entry", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);

    const comment = await commentFactory
      .transient({ db })
      .create({ entryId: entry.id, status: "approved" });

    expect(comment.id).toBeGreaterThan(0);
    expect(comment.entryId).toBe(entry.id);
    expect(comment.status).toBe("approved");
    expect(comment.authorName).toBeTruthy();
    expect(comment.authorEmail).toContain("@");
    expect(comment.bodyMd).toBeTruthy();

    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.entryId, entry.id));
    expect(rows).toHaveLength(1);
  });

  test("defaults status to pending", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const comment = await commentFactory
      .transient({ db })
      .create({ entryId: entry.id });
    expect(comment.status).toBe("pending");
  });

  test("requires entryId", async () => {
    const db = await createCommentsTestDb();
    await expect(commentFactory.transient({ db }).create({})).rejects.toThrow(
      /entryId/,
    );
  });
});
