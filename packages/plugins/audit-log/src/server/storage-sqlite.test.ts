import { createClient } from "@libsql/client";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, test } from "vitest";

import type { AppContext } from "@plumix/core";

import type { NewAuditLogRow } from "../db/schema.js";
import * as schema from "../db/schema.js";
import { auditLog } from "../db/schema.js";
import { encodeCursor } from "./cursor.js";
import { sqlite } from "./storage-sqlite.js";

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

const schemaImports = schema as unknown as Record<string, unknown>;

let cachedStatements: string[] | null = null;

async function compileSchemaSql(): Promise<string[]> {
  if (cachedStatements) return cachedStatements;
  const empty = await generateSQLiteDrizzleJson({}, undefined, "snake_case");
  const current = await generateSQLiteDrizzleJson(
    schemaImports,
    empty.id,
    "snake_case",
  );
  cachedStatements = await generateSQLiteMigration(empty, current);
  return cachedStatements;
}

async function createDb(): Promise<TestDb> {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema, casing: "snake_case" });
  const statements = await compileSchemaSql();
  for (const stmt of statements) await db.run(sql.raw(stmt));
  return db;
}

function row(
  overrides: Partial<NewAuditLogRow> & {
    readonly occurredAt: Date;
  },
): NewAuditLogRow {
  return {
    event: "entry:updated",
    subjectType: "entry",
    subjectId: "1",
    subjectLabel: "Hello",
    actorId: 1,
    actorLabel: "alice@example.com",
    properties: {},
    ...overrides,
  };
}

function ctxFor(db: TestDb): AppContext {
  return { db } as unknown as AppContext;
}

describe("sqlite() storage adapter — filter + cursor pagination", () => {
  let db: TestDb;
  let ctx: AppContext;

  beforeEach(async () => {
    db = await createDb();
    ctx = ctxFor(db);
  });

  test("no filter returns rows latest-first by (occurred_at desc, id desc)", async () => {
    await db
      .insert(auditLog)
      .values([
        row({ occurredAt: new Date("2026-05-01T00:00:00Z"), id: 1 }),
        row({ occurredAt: new Date("2026-05-03T00:00:00Z"), id: 2 }),
        row({ occurredAt: new Date("2026-05-02T00:00:00Z"), id: 3 }),
      ]);
    const result = await sqlite().query(ctx, {});
    expect(result.rows.map((r) => r.id)).toEqual([2, 3, 1]);
    expect(result.nextCursor).toBeNull();
  });

  test("actorId filter restricts to that actor's rows", async () => {
    await db
      .insert(auditLog)
      .values([
        row({ occurredAt: new Date("2026-05-01T00:00:00Z"), actorId: 1 }),
        row({ occurredAt: new Date("2026-05-02T00:00:00Z"), actorId: 2 }),
        row({ occurredAt: new Date("2026-05-03T00:00:00Z"), actorId: 1 }),
      ]);
    const result = await sqlite().query(ctx, { actorId: 1 });
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((r) => r.actorId === 1)).toBe(true);
  });

  test("subjectType + subjectId restrict together", async () => {
    await db.insert(auditLog).values([
      row({
        occurredAt: new Date("2026-05-01T00:00:00Z"),
        subjectType: "entry",
        subjectId: "1",
      }),
      row({
        occurredAt: new Date("2026-05-02T00:00:00Z"),
        subjectType: "entry",
        subjectId: "2",
      }),
      row({
        occurredAt: new Date("2026-05-03T00:00:00Z"),
        subjectType: "user",
        subjectId: "1",
      }),
    ]);
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
    await db.insert(auditLog).values([
      row({
        occurredAt: new Date("2026-05-01T00:00:00Z"),
        event: "entry:published",
      }),
      row({
        occurredAt: new Date("2026-05-02T00:00:00Z"),
        event: "entry:trashed",
      }),
      row({
        occurredAt: new Date("2026-05-03T00:00:00Z"),
        event: "user:signed_in",
      }),
    ]);
    const result = await sqlite().query(ctx, { eventPrefix: "entry:" });
    expect(result.rows.map((r) => r.event).sort()).toEqual([
      "entry:published",
      "entry:trashed",
    ]);
  });

  test("occurredAfter / occurredBefore form an inclusive window", async () => {
    await db
      .insert(auditLog)
      .values([
        row({ occurredAt: new Date("2026-05-01T00:00:00Z") }),
        row({ occurredAt: new Date("2026-05-03T00:00:00Z") }),
        row({ occurredAt: new Date("2026-05-05T00:00:00Z") }),
      ]);
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
    const values = Array.from({ length: 7 }, (_, i) =>
      row({
        occurredAt: new Date(
          `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        ),
        subjectId: String(i + 1),
      }),
    );
    await db.insert(auditLog).values(values);

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
    await db.insert(auditLog).values(
      Array.from({ length: 4 }, (_, i) =>
        row({
          occurredAt: new Date(
            `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
          ),
          subjectId: String(i + 1),
        }),
      ),
    );
    const page1 = await sqlite().query(ctx, { limit: 2 });
    expect(page1.rows.map((r) => r.subjectId)).toEqual(["4", "3"]);

    // A concurrent insert at an OLDER occurredAt lands behind the cursor.
    await db.insert(auditLog).values(
      row({
        occurredAt: new Date("2026-05-01T12:00:00Z"),
        subjectId: "concurrent",
      }),
    );

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
    const values = Array.from({ length: 75 }, (_, i) =>
      row({
        occurredAt: new Date(2026, 4, 1, 0, 0, i),
        subjectId: String(i + 1),
      }),
    );
    await db.insert(auditLog).values(values);
    const result = await sqlite().query(ctx, {});
    expect(result.rows).toHaveLength(50);
  });

  test("limit > 500 clamps to 500 (storage-side ceiling)", async () => {
    const values = Array.from({ length: 600 }, (_, i) =>
      row({
        occurredAt: new Date(2026, 4, 1, 0, 0, i),
        subjectId: String(i + 1),
      }),
    );
    await db.insert(auditLog).values(values);
    const result = await sqlite().query(ctx, { limit: 10_000 });
    expect(result.rows).toHaveLength(500);
  });

  test("nextCursor is null when the page returns fewer rows than the limit", async () => {
    await db
      .insert(auditLog)
      .values([
        row({ occurredAt: new Date("2026-05-01T00:00:00Z") }),
        row({ occurredAt: new Date("2026-05-02T00:00:00Z") }),
      ]);
    const result = await sqlite().query(ctx, { limit: 50 });
    expect(result.nextCursor).toBeNull();
  });

  test("an explicit cursor still respects filters", async () => {
    await db.insert(auditLog).values([
      row({
        occurredAt: new Date("2026-05-01T00:00:00Z"),
        event: "entry:published",
        subjectId: "a",
      }),
      row({
        occurredAt: new Date("2026-05-02T00:00:00Z"),
        event: "user:signed_in",
        subjectId: "b",
      }),
      row({
        occurredAt: new Date("2026-05-03T00:00:00Z"),
        event: "entry:trashed",
        subjectId: "c",
      }),
    ]);
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
