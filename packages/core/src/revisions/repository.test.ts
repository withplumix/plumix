import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { entries } from "../db/schema/entries.js";
import { userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import {
  getRevision,
  listRevisions,
  pruneOldRevisions,
  snapshotAsRevision,
} from "./repository.js";
import { REVISION_TYPE } from "./slug-codec.js";
import { decodeSnapshotEnvelope } from "./snapshot-envelope.js";

async function seedLiveEntry(db: Awaited<ReturnType<typeof createTestDb>>) {
  const author = await userFactory.transient({ db }).create({ role: "author" });
  const [entry] = await db
    .insert(entries)
    .values({
      type: "post",
      title: "Hello",
      slug: "hello",
      content: { type: "doc", content: [] },
      authorId: author.id,
      status: "draft",
      meta: { custom: "field" },
    })
    .returning();
  if (!entry) throw new Error("seed entry");
  return { author, entry };
}

describe("snapshotAsRevision", () => {
  test("writes a revision row mirroring the live entry's content + status + authorId", async () => {
    const db = await createTestDb();
    const { author, entry } = await seedLiveEntry(db);

    const revision = await snapshotAsRevision(db, {
      entry,
      authorId: author.id,
    });

    expect(revision.type).toBe(REVISION_TYPE);
    expect(revision.title).toBe("Hello");
    expect(revision.authorId).toBe(author.id);
    expect(revision.content).toEqual({ type: "doc", content: [] });
    expect(revision.slug).toMatch(/^revision:\d+:.+/);
  });

  test("stores the original slug + parentId in the snapshot envelope under meta", async () => {
    const db = await createTestDb();
    const { author, entry } = await seedLiveEntry(db);
    const revision = await snapshotAsRevision(db, {
      entry,
      authorId: author.id,
    });
    expect(decodeSnapshotEnvelope(revision.meta)).toEqual({
      slug: "hello",
      parentId: null,
    });
  });
});

describe("listRevisions", () => {
  test("returns revisions newest-first, paginated by cursor", async () => {
    const db = await createTestDb();
    const { author, entry } = await seedLiveEntry(db);
    for (let i = 0; i < 3; i += 1) {
      await snapshotAsRevision(db, { entry, authorId: author.id });
    }
    const page = await listRevisions(db, { entryId: entry.id, limit: 10 });
    expect(page.revisions).toHaveLength(3);
    const [newest, , oldest] = page.revisions;
    if (!newest || !oldest) throw new Error("expected 3 revisions");
    expect(newest.updatedAt.getTime()).toBeGreaterThanOrEqual(
      oldest.updatedAt.getTime(),
    );
    expect(page.nextCursor).toBeNull();
  });

  test("limit + cursor produce stable pagination across pages", async () => {
    const db = await createTestDb();
    const { author, entry } = await seedLiveEntry(db);
    for (let i = 0; i < 5; i += 1) {
      await snapshotAsRevision(db, { entry, authorId: author.id });
    }
    const page1 = await listRevisions(db, { entryId: entry.id, limit: 2 });
    expect(page1.revisions).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    if (!page1.nextCursor) throw new Error("expected nextCursor on page 1");
    const page2 = await listRevisions(db, {
      entryId: entry.id,
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.revisions).toHaveLength(2);
    const ids1 = page1.revisions.map((r) => r.id);
    const ids2 = page2.revisions.map((r) => r.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });
});

describe("listRevisions cross-entry isolation", () => {
  test("returns only the requested entry's revisions when other entries have more", async () => {
    const db = await createTestDb();
    const { author, entry: a } = await seedLiveEntry(db);
    const [b] = await db
      .insert(entries)
      .values({
        type: "post",
        title: "Other",
        slug: "other",
        content: { type: "doc", content: [] },
        authorId: author.id,
        status: "draft",
        meta: {},
      })
      .returning();
    if (!b) throw new Error("seed entry b");
    // 30 revisions of b would saturate any naive limit window first.
    for (let i = 0; i < 30; i += 1) {
      await snapshotAsRevision(db, { entry: b, authorId: author.id });
    }
    await snapshotAsRevision(db, { entry: a, authorId: author.id });
    await snapshotAsRevision(db, { entry: a, authorId: author.id });

    const page = await listRevisions(db, { entryId: a.id, limit: 25 });
    expect(page.revisions).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });
});

describe("pruneOldRevisions cross-entry isolation", () => {
  test("does not delete other entries' revisions when pruning past the cap", async () => {
    const db = await createTestDb();
    const { author, entry: a } = await seedLiveEntry(db);
    const [b] = await db
      .insert(entries)
      .values({
        type: "post",
        title: "Other",
        slug: "other",
        content: { type: "doc", content: [] },
        authorId: author.id,
        status: "draft",
        meta: {},
      })
      .returning();
    if (!b) throw new Error("seed entry b");
    for (let i = 0; i < 4; i += 1) {
      await snapshotAsRevision(db, { entry: a, authorId: author.id });
    }
    for (let i = 0; i < 3; i += 1) {
      await snapshotAsRevision(db, { entry: b, authorId: author.id });
    }
    const pruned = await pruneOldRevisions(db, {
      entryId: a.id,
      maxRevisions: 2,
    });
    expect(pruned).toBe(2);
    const bRemaining = await listRevisions(db, { entryId: b.id, limit: 25 });
    expect(bRemaining.revisions).toHaveLength(3);
  });
});

describe("getRevision", () => {
  test("returns the revision row by id", async () => {
    const db = await createTestDb();
    const { author, entry } = await seedLiveEntry(db);
    const revision = await snapshotAsRevision(db, {
      entry,
      authorId: author.id,
    });
    const fetched = await getRevision(db, { revisionId: revision.id });
    expect(fetched?.id).toBe(revision.id);
    expect(fetched?.type).toBe(REVISION_TYPE);
  });

  test("returns undefined for a non-revision row (type guard)", async () => {
    const db = await createTestDb();
    const { entry } = await seedLiveEntry(db);
    expect(await getRevision(db, { revisionId: entry.id })).toBeUndefined();
  });
});

describe("pruneOldRevisions", () => {
  test("deletes the oldest revisions past the cap, returns the pruned count", async () => {
    const db = await createTestDb();
    const { author, entry } = await seedLiveEntry(db);
    for (let i = 0; i < 5; i += 1) {
      await snapshotAsRevision(db, { entry, authorId: author.id });
    }
    const pruned = await pruneOldRevisions(db, {
      entryId: entry.id,
      maxRevisions: 3,
    });
    expect(pruned).toBe(2);
    const remaining = await db.query.entries.findMany({
      where: and(eq(entries.type, REVISION_TYPE)),
    });
    expect(remaining).toHaveLength(3);
  });

  test("returns 0 and deletes nothing when under the cap", async () => {
    const db = await createTestDb();
    const { author, entry } = await seedLiveEntry(db);
    for (let i = 0; i < 2; i += 1) {
      await snapshotAsRevision(db, { entry, authorId: author.id });
    }
    expect(
      await pruneOldRevisions(db, { entryId: entry.id, maxRevisions: 5 }),
    ).toBe(0);
  });
});
