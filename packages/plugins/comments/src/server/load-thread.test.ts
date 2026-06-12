import { factoriesFor } from "plumix/test";
import { describe, expect, test } from "vitest";

import { createCommentsTestDb, ctxFor, seedPublishedPost } from "../test/db.js";
import { commentFactory } from "../test/factories.js";
import { loadThread } from "./load-thread.js";

describe("loadThread", () => {
  test("returns only approved comments, rendered, without leaking email", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const f = commentFactory.transient({ db });
    await f.create({
      entryId: entry.id,
      status: "approved",
      bodyMd: "**hi**",
      authorEmail: "secret@example.test",
    });
    await f.create({ entryId: entry.id, status: "pending" });
    await f.create({ entryId: entry.id, status: "spam" });
    await f.create({ entryId: entry.id, status: "trash" });

    const thread = await loadThread(ctxFor(db), entry.id, 3);

    expect(thread.count).toBe(1);
    expect(thread.comments).toHaveLength(1);
    const comment = thread.comments[0];
    expect(comment?.bodyHtml).toContain("<strong>hi</strong>");
    expect(comment?.avatarUrl).toContain("gravatar.com");
    expect(JSON.stringify(thread)).not.toContain("secret@example.test");
  });

  test("flags registered vs anonymous authors", async () => {
    const db = await createCommentsTestDb();
    const f0 = factoriesFor(db);
    const user = await f0.user.create({});
    const entry = await f0.entry.create({
      type: "post",
      authorId: user.id,
      status: "published",
    });
    const f = commentFactory.transient({ db });
    await f.create({
      entryId: entry.id,
      status: "approved",
      authorUserId: user.id,
    });
    await f.create({
      entryId: entry.id,
      status: "approved",
      authorUserId: null,
    });

    const thread = await loadThread(ctxFor(db), entry.id, 3);
    expect(thread.comments.map((c) => c.isRegistered).sort()).toEqual([
      false,
      true,
    ]);
  });

  test("scopes to the requested entry", async () => {
    const db = await createCommentsTestDb();
    const a = await seedPublishedPost(db);
    const b = await seedPublishedPost(db);
    const f = commentFactory.transient({ db });
    await f.create({ entryId: a.id, status: "approved" });
    await f.create({ entryId: b.id, status: "approved" });
    await f.create({ entryId: b.id, status: "approved" });

    expect((await loadThread(ctxFor(db), a.id, 3)).count).toBe(1);
    expect((await loadThread(ctxFor(db), b.id, 3)).count).toBe(2);
  });

  test("returns an empty thread when nothing is approved", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    await commentFactory
      .transient({ db })
      .create({ entryId: entry.id, status: "pending" });

    const thread = await loadThread(ctxFor(db), entry.id, 3);
    expect(thread.count).toBe(0);
    expect(thread.comments).toEqual([]);
  });
});

describe("loadThread — nesting", () => {
  test("nests an approved reply under its parent, replies chronological", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    const root = await seed.create({
      entryId: entry.id,
      status: "approved",
      bodyMd: "root",
      createdAt: new Date("2026-06-01T00:00:00Z"),
    });
    await seed.create({
      entryId: entry.id,
      status: "approved",
      parentId: root.id,
      bodyMd: "second",
      createdAt: new Date("2026-06-03T00:00:00Z"),
    });
    await seed.create({
      entryId: entry.id,
      status: "approved",
      parentId: root.id,
      bodyMd: "first",
      createdAt: new Date("2026-06-02T00:00:00Z"),
    });

    const thread = await loadThread(ctxFor(db), entry.id, 3);
    expect(thread.count).toBe(3);
    expect(thread.comments).toHaveLength(1);
    const replies = thread.comments[0]?.replies ?? [];
    expect(replies.map((r) => r.bodyHtml.includes("first"))).toEqual([
      true,
      false,
    ]);
  });

  test("excludes a reply whose parent isn't approved", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    const hiddenParent = await seed.create({
      entryId: entry.id,
      status: "pending",
    });
    await seed.create({
      entryId: entry.id,
      status: "approved",
      parentId: hiddenParent.id,
    });

    const thread = await loadThread(ctxFor(db), entry.id, 3);
    expect(thread.count).toBe(0);
  });

  test("the maxDepth bound stops the recursion", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    const root = await seed.create({ entryId: entry.id, status: "approved" });
    const reply = await seed.create({
      entryId: entry.id,
      status: "approved",
      parentId: root.id,
    });
    await seed.create({
      entryId: entry.id,
      status: "approved",
      parentId: reply.id,
    });

    // maxDepth 1 → root (0) + its direct reply (1); the depth-2 reply is cut.
    const thread = await loadThread(ctxFor(db), entry.id, 1);
    expect(thread.count).toBe(2);
  });
});
