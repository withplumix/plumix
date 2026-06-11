import type { AppContext } from "plumix/plugin";
import { beforeEach, describe, expect, test } from "vitest";

import type { TestDb } from "../test-support.js";
import { auditLogFactory, createDb, ctxFor } from "../test-support.js";
import { encodeCursor } from "./cursor.js";
import { sqlite } from "./storage-sqlite.js";

describe("sqlite() storage adapter — filter + cursor pagination", () => {
  let db: TestDb;
  let ctx: AppContext;
  let factory: typeof auditLogFactory;

  beforeEach(async () => {
    db = await createDb();
    ctx = ctxFor(db);
    factory = auditLogFactory.transient({ db });
  });

  test("no filter returns rows latest-first by (occurred_at desc, id desc)", async () => {
    for (const o of [
      { occurredAt: new Date("2026-05-01T00:00:00Z"), id: 1 },
      { occurredAt: new Date("2026-05-03T00:00:00Z"), id: 2 },
      { occurredAt: new Date("2026-05-02T00:00:00Z"), id: 3 },
    ]) {
      await factory.create(o);
    }
    const result = await sqlite().query(ctx, {});
    expect(result.rows.map((r) => r.id)).toEqual([2, 3, 1]);
    expect(result.nextCursor).toBeNull();
  });

  test("actorId filter restricts to that actor's rows", async () => {
    for (const o of [
      { occurredAt: new Date("2026-05-01T00:00:00Z"), actorId: 1 },
      { occurredAt: new Date("2026-05-02T00:00:00Z"), actorId: 2 },
      { occurredAt: new Date("2026-05-03T00:00:00Z"), actorId: 1 },
    ]) {
      await factory.create(o);
    }
    const result = await sqlite().query(ctx, { actorId: 1 });
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((r) => r.actorId === 1)).toBe(true);
  });

  test("subjectType + subjectId restrict together", async () => {
    for (const o of [
      {
        occurredAt: new Date("2026-05-01T00:00:00Z"),
        subjectType: "entry",
        subjectId: "1",
      },
      {
        occurredAt: new Date("2026-05-02T00:00:00Z"),
        subjectType: "entry",
        subjectId: "2",
      },
      {
        occurredAt: new Date("2026-05-03T00:00:00Z"),
        subjectType: "user",
        subjectId: "1",
      },
    ]) {
      await factory.create(o);
    }
    const both = await sqlite().query(ctx, {
      subjectType: "entry",
      subjectId: "1",
    });
    expect(both.rows).toHaveLength(1);
    expect(both.rows[0]?.subjectId).toBe("1");

    const justType = await sqlite().query(ctx, { subjectType: "entry" });
    expect(justType.rows).toHaveLength(2);
  });

  test("eventPrefix does an indexed prefix range scan", async () => {
    for (const o of [
      {
        occurredAt: new Date("2026-05-01T00:00:00Z"),
        event: "entry:published",
      },
      {
        occurredAt: new Date("2026-05-02T00:00:00Z"),
        event: "entry:trashed",
      },
      {
        occurredAt: new Date("2026-05-03T00:00:00Z"),
        event: "user:signed_in",
      },
    ]) {
      await factory.create(o);
    }
    const result = await sqlite().query(ctx, { eventPrefix: "entry:" });
    expect(result.rows.map((r) => r.event).sort()).toEqual([
      "entry:published",
      "entry:trashed",
    ]);
  });

  test("occurredAfter / occurredBefore form an inclusive window", async () => {
    for (const o of [
      { occurredAt: new Date("2026-05-01T00:00:00Z") },
      { occurredAt: new Date("2026-05-03T00:00:00Z") },
      { occurredAt: new Date("2026-05-05T00:00:00Z") },
    ]) {
      await factory.create(o);
    }
    const result = await sqlite().query(ctx, {
      occurredAfter: Math.floor(
        new Date("2026-05-02T00:00:00Z").getTime() / 1000,
      ),
      occurredBefore: Math.floor(
        new Date("2026-05-04T00:00:00Z").getTime() / 1000,
      ),
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.occurredAt.toISOString()).toBe(
      "2026-05-03T00:00:00.000Z",
    );
  });

  test("limit + cursor paginate without skipping or repeating rows", async () => {
    for (let i = 0; i < 7; i += 1) {
      await factory.create({
        occurredAt: new Date(
          `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        ),
        subjectId: String(i + 1),
      });
    }

    const page1 = await sqlite().query(ctx, { limit: 3 });
    expect(page1.rows.map((r) => r.subjectId)).toEqual(["7", "6", "5"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await sqlite().query(ctx, {
      limit: 3,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.rows.map((r) => r.subjectId)).toEqual(["4", "3", "2"]);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await sqlite().query(ctx, {
      limit: 3,
      cursor: page2.nextCursor ?? undefined,
    });
    expect(page3.rows.map((r) => r.subjectId)).toEqual(["1"]);
    expect(page3.nextCursor).toBeNull();
  });

  test("a row inserted between page fetches at an older timestamp is included in the next page (no skip)", async () => {
    for (let i = 0; i < 4; i += 1) {
      await factory.create({
        occurredAt: new Date(
          `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        ),
        subjectId: String(i + 1),
      });
    }
    const page1 = await sqlite().query(ctx, { limit: 2 });
    expect(page1.rows.map((r) => r.subjectId)).toEqual(["4", "3"]);

    // A concurrent insert at an OLDER occurredAt lands behind the cursor.
    await factory.create({
      occurredAt: new Date("2026-05-01T12:00:00Z"),
      subjectId: "concurrent",
    });

    const page2 = await sqlite().query(ctx, {
      limit: 10,
      cursor: page1.nextCursor ?? undefined,
    });
    // Page 2 must include both the original 2,1 AND the new concurrent
    // row that lands at 5-01 12:00 — between 5-01 00:00 (id=1) and
    // 5-02 00:00 (id=2). The new row gets a fresh id (=5) > cursor's id,
    // but its occurredAt is BEFORE the cursor's, so the strict-less
    // comparison must use the row tuple, not OR of single columns.
    const ids = page2.rows.map((r) => r.subjectId).sort();
    expect(ids).toContain("concurrent");
    expect(ids).toContain("2");
    expect(ids).toContain("1");
  });

  test("limit defaults to 50 when omitted", async () => {
    await factory.createList(75);
    const result = await sqlite().query(ctx, {});
    expect(result.rows).toHaveLength(50);
  });

  test("limit > 500 clamps to 500 (storage-side ceiling)", async () => {
    await factory.createList(600);
    const result = await sqlite().query(ctx, { limit: 10_000 });
    expect(result.rows).toHaveLength(500);
  });

  test("nextCursor is null when the page returns fewer rows than the limit", async () => {
    for (const o of [
      { occurredAt: new Date("2026-05-01T00:00:00Z") },
      { occurredAt: new Date("2026-05-02T00:00:00Z") },
    ]) {
      await factory.create(o);
    }
    const result = await sqlite().query(ctx, { limit: 50 });
    expect(result.nextCursor).toBeNull();
  });

  test("an explicit cursor still respects filters", async () => {
    for (const o of [
      {
        occurredAt: new Date("2026-05-01T00:00:00Z"),
        event: "entry:published",
        subjectId: "a",
      },
      {
        occurredAt: new Date("2026-05-02T00:00:00Z"),
        event: "user:signed_in",
        subjectId: "b",
      },
      {
        occurredAt: new Date("2026-05-03T00:00:00Z"),
        event: "entry:trashed",
        subjectId: "c",
      },
    ]) {
      await factory.create(o);
    }
    const cursor = encodeCursor({
      occurredAt: Math.floor(new Date("2026-05-04T00:00:00Z").getTime() / 1000),
      id: 1,
    });
    const result = await sqlite().query(ctx, {
      cursor,
      eventPrefix: "entry:",
    });
    expect(result.rows.map((r) => r.subjectId)).toEqual(["c", "a"]);
  });
});

describe("sqlite() storage adapter — purge", () => {
  let db: TestDb;
  let ctx: AppContext;
  let adapter: ReturnType<typeof sqlite>;
  let factory: typeof auditLogFactory;

  beforeEach(async () => {
    db = await createDb();
    ctx = ctxFor(db);
    adapter = sqlite();
    factory = auditLogFactory.transient({ db });
  });

  async function runPurge(cutoff: Date) {
    if (!adapter.purge) {
      throw new Error("sqlite() adapter must implement purge");
    }
    return adapter.purge(ctx, { cutoff });
  }

  test("deletes rows strictly older than the cutoff and reports the count", async () => {
    for (const o of [
      { occurredAt: new Date("2026-01-01T00:00:00Z"), subjectId: "old-1" },
      { occurredAt: new Date("2026-02-01T00:00:00Z"), subjectId: "old-2" },
      { occurredAt: new Date("2026-04-11T00:00:00Z"), subjectId: "boundary" },
      { occurredAt: new Date("2026-04-15T00:00:00Z"), subjectId: "kept-1" },
      { occurredAt: new Date("2026-05-11T00:00:00Z"), subjectId: "kept-2" },
    ]) {
      await factory.create(o);
    }

    const result = await runPurge(new Date("2026-04-11T00:00:00Z"));

    expect(result.deleted).toBe(2);

    const remaining = await adapter.query(ctx, {});
    expect(remaining.rows.map((r) => r.subjectId).sort()).toEqual([
      "boundary",
      "kept-1",
      "kept-2",
    ]);
  });

  test("returns deleted: 0 when no rows match the cutoff", async () => {
    await auditLogFactory
      .transient({ db })
      .create({ occurredAt: new Date("2026-05-11T00:00:00Z") });

    const result = await runPurge(new Date("2026-01-01T00:00:00Z"));

    expect(result.deleted).toBe(0);
  });

  test("empty table — deleted: 0", async () => {
    const result = await runPurge(new Date("2026-05-11T00:00:00Z"));
    expect(result.deleted).toBe(0);
  });
});
