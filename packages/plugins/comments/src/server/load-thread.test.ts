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

    const thread = await loadThread(ctxFor(db), entry.id);

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

    const thread = await loadThread(ctxFor(db), entry.id);
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

    expect((await loadThread(ctxFor(db), a.id)).count).toBe(1);
    expect((await loadThread(ctxFor(db), b.id)).count).toBe(2);
  });

  test("returns an empty thread when nothing is approved", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    await commentFactory
      .transient({ db })
      .create({ entryId: entry.id, status: "pending" });

    const thread = await loadThread(ctxFor(db), entry.id);
    expect(thread.count).toBe(0);
    expect(thread.comments).toEqual([]);
  });
});
