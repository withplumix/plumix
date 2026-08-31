import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Db } from "../context/app.js";
import { asc, eq, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { entryChanges } from "../db/schema/entry_changes.js";
import {
  pruneOldRevisions,
  snapshotAsRevision,
  upsertAutosave,
} from "../revisions/repository.js";
import { adminUser, entryFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { createRpcHarness } from "../test/rpc.js";
import {
  ackEntryChanges,
  ENTRY_CHANGE_FEED_RESET_DDL,
  readEntryChanges,
} from "./change-feed.js";

let db: Db;
let authorId: number;

async function feed(): Promise<readonly { entryId: number; kind: string }[]> {
  return db
    .select({ entryId: entryChanges.entryId, kind: entryChanges.kind })
    .from(entryChanges)
    .orderBy(asc(entryChanges.id));
}

async function clearFeed(): Promise<void> {
  await db.delete(entryChanges);
}

beforeEach(async () => {
  db = await createTestDb();
  const author = await adminUser.transient({ db }).create();
  authorId = author.id;
});

describe("entry change feed", () => {
  test("records an upsert for an entry written straight to the database", async () => {
    const entry = await entryFactory.transient({ db }).create({ authorId });

    expect(await feed()).toEqual([{ entryId: entry.id, kind: "upsert" }]);
  });

  test("records a create and an update made through the RPC surface", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const created = await h.client.entry.create({
      title: "Hello",
      slug: "hello",
    });
    await h.client.entry.update({ id: created.id, title: "Hello again" });

    const changes = await readEntryChanges(h.db, 10);

    expect(changes.map((change) => [change.entryId, change.kind])).toEqual([
      [created.id, "upsert"],
      [created.id, "upsert"],
    ]);
  });

  test.each([
    ["title", { title: "Renamed" }],
    ["content", { content: { type: "plumix.v2", blocks: [] } }],
    ["excerpt", { excerpt: "A summary" }],
    ["status", { status: "published" as const }],
    ["type", { type: "page" }],
    ["slug", { slug: "renamed" }],
  ])("records an upsert when %s changes", async (_column, patch) => {
    const entry = await entryFactory
      .transient({ db })
      .create({ authorId, excerpt: null, status: "draft" });
    await clearFeed();

    await db.update(entries).set(patch).where(eq(entries.id, entry.id));

    expect(await feed()).toEqual([{ entryId: entry.id, kind: "upsert" }]);
  });

  // Revisions and autosaves are rows in `entries` too, under types the editor
  // owns.
  test("records nothing for a revision snapshot", async () => {
    const entry = await entryFactory.transient({ db }).create({ authorId });
    await clearFeed();

    await snapshotAsRevision(db, { entry, authorId });

    expect(await feed()).toEqual([]);
  });

  test("records nothing for an autosave, or for re-saving one", async () => {
    const entry = await entryFactory.transient({ db }).create({ authorId });
    await clearFeed();
    const patch = {
      title: "Draft",
      content: {},
      excerpt: null,
      meta: {},
    };

    await upsertAutosave(db, { entry, authorId, patch });
    await upsertAutosave(db, {
      entry,
      authorId,
      patch: { ...patch, title: "Draft 2" },
    });

    expect(await feed()).toEqual([]);
  });

  test("records no tombstone when a revision is pruned past the cap", async () => {
    const entry = await entryFactory.transient({ db }).create({ authorId });
    await snapshotAsRevision(db, { entry, authorId });
    await snapshotAsRevision(db, { entry, authorId });
    await clearFeed();

    await pruneOldRevisions(db, { entryId: entry.id, maxRevisions: 1 });

    expect(await feed()).toEqual([]);
  });

  // The path no other test reaches: a test database is always a fresh install,
  // but the second migration exists for the ones that already ran the first.
  test("replaces the unguarded triggers an existing install carries", async () => {
    await db.run(sql.raw("DROP TRIGGER entries_change_feed_insert"));
    await db.run(
      sql.raw(`CREATE TRIGGER entries_change_feed_insert AFTER INSERT ON entries
      BEGIN
        INSERT INTO entry_changes (entry_id, kind) VALUES (new.id, 'upsert');
      END`),
    );
    const entry = await entryFactory.transient({ db }).create({ authorId });
    await clearFeed();
    await snapshotAsRevision(db, { entry, authorId });
    // The defect the migration corrects, reproduced.
    expect(await feed()).toHaveLength(1);

    for (const statement of ENTRY_CHANGE_FEED_RESET_DDL) {
      await db.run(sql.raw(statement));
    }
    await clearFeed();
    await snapshotAsRevision(db, { entry, authorId });

    expect(await feed()).toEqual([]);
  });

  test("records an upsert when an entry is re-parented", async () => {
    const parent = await entryFactory.transient({ db }).create({ authorId });
    const child = await entryFactory.transient({ db }).create({ authorId });
    await clearFeed();

    await db
      .update(entries)
      .set({ parentId: parent.id })
      .where(eq(entries.id, child.id));

    expect(await feed()).toEqual([{ entryId: child.id, kind: "upsert" }]);
  });

  // `parentId` is `onDelete: "set null"`, so removing a parent re-roots its
  // children — a URL change for each, and one the application never writes.
  test("records the children a deleted parent re-roots", async () => {
    const parent = await entryFactory.transient({ db }).create({ authorId });
    const child = await entryFactory
      .transient({ db })
      .create({ authorId, parentId: parent.id });
    await clearFeed();

    await db.delete(entries).where(eq(entries.id, parent.id));

    expect(await feed()).toEqual([
      { entryId: child.id, kind: "upsert" },
      { entryId: parent.id, kind: "delete" },
    ]);
  });

  test("records nothing when an update touches only metadata", async () => {
    const entry = await entryFactory.transient({ db }).create({ authorId });
    await clearFeed();

    await db
      .update(entries)
      .set({ meta: { views: 12 }, sortOrder: 3 })
      .where(eq(entries.id, entry.id));

    expect(await feed()).toEqual([]);
  });

  test("records a tombstone distinguishable from an upsert when an entry is deleted", async () => {
    const entry = await entryFactory.transient({ db }).create({ authorId });
    await clearFeed();

    await db.delete(entries).where(eq(entries.id, entry.id));

    expect(await feed()).toEqual([{ entryId: entry.id, kind: "delete" }]);
  });
});

describe("draining the entry change feed", () => {
  test("reads the oldest changes first, bounded by the limit", async () => {
    const created = [];
    for (let i = 0; i < 5; i += 1) {
      created.push(await entryFactory.transient({ db }).create({ authorId }));
    }

    const batch = await readEntryChanges(db, 3);

    expect(batch.map((change) => change.entryId)).toEqual(
      created.slice(0, 3).map((entry) => entry.id),
    );
  });

  test("leaves the feed empty once every change has been acknowledged", async () => {
    await entryFactory.transient({ db }).create({ authorId });
    await entryFactory.transient({ db }).create({ authorId });

    await ackEntryChanges(db, await readEntryChanges(db, 10));

    expect(await feed()).toEqual([]);
  });

  test("leaves a change enqueued since the read for the next drain", async () => {
    await entryFactory.transient({ db }).create({ authorId });
    const batch = await readEntryChanges(db, 10);
    const second = await entryFactory.transient({ db }).create({ authorId });

    await ackEntryChanges(db, batch);

    expect(await feed()).toEqual([{ entryId: second.id, kind: "upsert" }]);
  });

  test("splits an acknowledgement D1 could not bind in one statement", async () => {
    const changes = Array.from({ length: 250 }, (_, i) => ({
      id: i + 1,
      entryId: i + 1,
      kind: "upsert" as const,
    }));
    const del = vi.spyOn(db, "delete");

    await ackEntryChanges(db, changes);

    // 250 ids at D1's 100-bound-parameter ceiling is three statements.
    expect(del).toHaveBeenCalledTimes(3);
  });

  test("acknowledges an empty batch without touching the feed", async () => {
    const entry = await entryFactory.transient({ db }).create({ authorId });

    await ackEntryChanges(db, []);

    expect(await feed()).toEqual([{ entryId: entry.id, kind: "upsert" }]);
  });
});
