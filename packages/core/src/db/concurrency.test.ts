import { createClient } from "@libsql/client";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import * as v from "valibot";
import { describe, expect, test } from "vitest";

import {
  claim,
  ConflictError,
  etagOf,
  ifMatchObject,
  mergePatch,
  nextToken,
  parseIfMatch,
} from "./concurrency.js";

/** A plugin-shaped table: any table with `updated_at` opts in. */
const notes = sqliteTable("notes", (t) => ({
  id: t.integer().primaryKey(),
  body: t.text().notNull(),
  updatedAt: t.integer({ mode: "timestamp" }).notNull(),
}));

async function notesDb(updatedAt: Date) {
  const db = drizzle(createClient({ url: ":memory:" }), {
    casing: "snake_case",
  });
  await db.run(
    sql`CREATE TABLE notes (id integer PRIMARY KEY, body text NOT NULL, updated_at integer NOT NULL)`,
  );
  await db.insert(notes).values({ id: 1, body: "first", updatedAt });
  return db;
}

const T0 = new Date("2026-10-18T12:00:00Z");

describe("etagOf and parseIfMatch", () => {
  test("an etag parses back to the token it was made from", () => {
    expect(parseIfMatch(etagOf(T0))).toEqual(T0);
  });

  test.each(["", "abc", "12.5", "-3", "1e9", " 1760788800"])(
    "a malformed ifMatch %j parses to undefined",
    (value) => {
      expect(parseIfMatch(value)).toBeUndefined();
    },
  );
});

describe("nextToken", () => {
  test("takes the clock when it is past the copy's token", () => {
    expect(nextToken(T0, new Date("2026-10-18T12:00:05.700Z"))).toEqual(
      new Date("2026-10-18T12:00:05Z"),
    );
  });

  test("moves one second past the copy's token when the clock has not", () => {
    expect(nextToken(T0, new Date("2026-10-18T12:00:00.900Z"))).toEqual(
      new Date("2026-10-18T12:00:01Z"),
    );
  });

  test("keeps increasing under a frozen clock", () => {
    const frozen = new Date("2026-10-18T12:00:00.500Z");
    const first = nextToken(T0, frozen);
    const second = nextToken(first, frozen);

    expect([first, second]).toEqual([
      new Date("2026-10-18T12:00:01Z"),
      new Date("2026-10-18T12:00:02Z"),
    ]);
  });
});

describe("claim", () => {
  test("a write from the current copy lands and moves the token", async () => {
    const db = await notesDb(T0);
    const guard = claim(notes.updatedAt, T0, T0);

    const rows = await db
      .update(notes)
      .set({ body: "second", ...guard.set })
      .where(guard.where)
      .returning({ updatedAt: notes.updatedAt });

    expect(rows).toEqual([{ updatedAt: new Date("2026-10-18T12:00:01Z") }]);
  });

  test("a write from a stale copy changes nothing", async () => {
    const db = await notesDb(new Date("2026-10-18T12:00:01Z"));
    const guard = claim(notes.updatedAt, T0, T0);

    const rows = await db
      .update(notes)
      .set({ body: "stale", ...guard.set })
      .where(guard.where)
      .returning({ updatedAt: notes.updatedAt });

    expect(rows).toEqual([]);
    expect(
      await db.select({ body: notes.body }).from(notes).where(eq(notes.id, 1)),
    ).toEqual([{ body: "first" }]);
  });
});

describe("mergePatch", () => {
  // RFC 7386, appendix A.
  test.each([
    [{ a: "b" }, { a: "c" }, { a: "c" }],
    [{ a: "b" }, { b: "c" }, { a: "b", b: "c" }],
    [{ a: "b" }, { a: null }, {}],
    [{ a: "b", b: "c" }, { a: null }, { b: "c" }],
    [{ a: ["b"] }, { a: "c" }, { a: "c" }],
    [{ a: "c" }, { a: ["b"] }, { a: ["b"] }],
    [{ a: { b: "c" } }, { a: { b: "d", c: null } }, { a: { b: "d" } }],
    [{ a: [{ b: "c" }] }, { a: [1] }, { a: [1] }],
    [
      ["a", "b"],
      ["c", "d"],
      ["c", "d"],
    ],
    [{ a: "b" }, ["c"], ["c"]],
    [{ a: "foo" }, null, null],
    [{ a: "foo" }, "bar", "bar"],
    [{ e: null }, { a: 1 }, { e: null, a: 1 }],
    [[1, 2], { a: "b", c: null }, { a: "b" }],
    [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }],
  ])("merges %j with %j into %j", (target, patch, expected) => {
    expect(mergePatch(target, patch)).toEqual(expected);
  });
});

describe("ConflictError", () => {
  test("carries the current etag and change time as an etag_mismatch", () => {
    const error = new ConflictError(new Date("2026-10-18T12:00:07Z"));

    expect(error.data).toEqual({
      reason: "etag_mismatch",
      etag: "1792324807",
      updatedAt: new Date("2026-10-18T12:00:07Z"),
    });
  });

  test("a version counter's conflict carries its etag and no change time", () => {
    const error = new ConflictError(4);

    expect(error.data).toEqual({ reason: "etag_mismatch", etag: "4" });
  });

  test("names itself and says why it was thrown", () => {
    const error = new ConflictError(new Date("2026-10-18T12:00:07Z"));

    expect(String(error)).toBe(
      "ConflictError: The resource changed since this copy was read.",
    );
  });
});

describe("ifMatchObject", () => {
  const schema = ifMatchObject({ id: v.number() }, "Send it.");

  test("hands the handler the token an etag names", () => {
    expect(v.parse(schema, { id: 1, ifMatch: etagOf(T0) })).toEqual({
      id: 1,
      ifMatch: T0,
    });
  });

  test("a missing ifMatch fails with the guidance message", () => {
    const result = v.safeParse(schema, { id: 1 });

    expect(result.issues?.map((issue) => issue.message)).toEqual(["Send it."]);
  });

  test("a malformed ifMatch fails with the guidance message", () => {
    const result = v.safeParse(schema, { id: 1, ifMatch: "soon" });

    expect(result.issues?.map((issue) => issue.message)).toEqual(["Send it."]);
  });

  test("another missing field keeps its own message", () => {
    const result = v.safeParse(schema, { ifMatch: etagOf(T0) });

    expect(result.issues?.map((issue) => issue.message)).toEqual([
      'Invalid key: Expected "id" but received undefined',
    ]);
  });
});
