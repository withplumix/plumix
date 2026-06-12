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

    const thread = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 100,
    });

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

    const thread = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 100,
    });
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

    expect(
      (await loadThread(ctxFor(db), a.id, { maxDepth: 3, rootsPerPage: 100 }))
        .count,
    ).toBe(1);
    expect(
      (await loadThread(ctxFor(db), b.id, { maxDepth: 3, rootsPerPage: 100 }))
        .count,
    ).toBe(2);
  });

  test("returns an empty thread when nothing is approved", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    await commentFactory
      .transient({ db })
      .create({ entryId: entry.id, status: "pending" });

    const thread = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 100,
    });
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

    const thread = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 100,
    });
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

    const thread = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 100,
    });
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
    const thread = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 1,
      rootsPerPage: 100,
    });
    expect(thread.count).toBe(2);
  });
});

describe("loadThread — root pagination", () => {
  // Seeds `n` approved roots dated 2026-06-01 .. 2026-06-0n so newest-first
  // ordering is deterministic; returns them oldest-first.
  async function seedRoots(
    db: Awaited<ReturnType<typeof createCommentsTestDb>>,
    entryId: number,
    n: number,
  ) {
    const f = commentFactory.transient({ db });
    const made = [];
    for (let i = 1; i <= n; i++) {
      made.push(
        await f.create({
          entryId,
          status: "approved",
          bodyMd: `root ${String(i)}`,
          createdAt: new Date(
            `2026-06-${String(i).padStart(2, "0")}T00:00:00Z`,
          ),
        }),
      );
    }
    return made;
  }

  test("returns the newest rootsPerPage roots first, with a cursor for more", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    await seedRoots(db, entry.id, 3);

    const page = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 2,
    });

    expect(page.comments).toHaveLength(2);
    expect(page.comments[0]?.bodyHtml).toContain("root 3");
    expect(page.comments[1]?.bodyHtml).toContain("root 2");
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
    expect(page.count).toBe(3);
  });

  test("the cursor loads the next, older page without overlap", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    await seedRoots(db, entry.id, 3);

    const first = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 2,
    });
    const second = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 2,
      cursor: first.nextCursor,
    });

    expect(second.comments).toHaveLength(1);
    expect(second.comments[0]?.bodyHtml).toContain("root 1");
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
    const firstIds = new Set(first.comments.map((c) => c.id));
    expect(second.comments.every((c) => !firstIds.has(c.id))).toBe(true);
  });

  test("a root's descendants load with that root's page", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const [oldest] = await seedRoots(db, entry.id, 3);
    await commentFactory.transient({ db }).create({
      entryId: entry.id,
      status: "approved",
      parentId: oldest?.id,
      bodyMd: "reply to oldest",
    });

    const first = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 2,
    });
    expect(JSON.stringify(first.comments)).not.toContain("reply to oldest");
    expect(first.count).toBe(4);

    const second = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 2,
      cursor: first.nextCursor,
    });
    expect(second.comments[0]?.replies[0]?.bodyHtml).toContain(
      "reply to oldest",
    );
    // Load-more pages skip the count walk; the client kept page one's total.
    expect(second.count).toBe(0);
  });

  test("breaks ties on id when roots share a timestamp — no dupe or skip", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const createdAt = new Date("2026-06-01T00:00:00Z");
    const f = commentFactory.transient({ db });
    const a = await f.create({
      entryId: entry.id,
      status: "approved",
      createdAt,
    });
    const b = await f.create({
      entryId: entry.id,
      status: "approved",
      createdAt,
    });

    const first = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 1,
    });
    const second = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 1,
      cursor: first.nextCursor,
    });

    // Higher id wins the DESC tie-break, so the later insert is page one.
    expect(first.comments.map((c) => c.id)).toEqual([b.id]);
    expect(second.comments.map((c) => c.id)).toEqual([a.id]);
    expect(second.hasMore).toBe(false);
  });

  test("an unparseable cursor falls back to the first page", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    await seedRoots(db, entry.id, 2);

    const page = await loadThread(ctxFor(db), entry.id, {
      maxDepth: 3,
      rootsPerPage: 2,
      cursor: "garbage",
    });

    expect(page.comments).toHaveLength(2);
    expect(page.comments[0]?.bodyHtml).toContain("root 2");
  });
});
