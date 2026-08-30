import { describe, expect, test } from "vitest";

import { userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { DbError } from "./errors.js";
import { rowsAffected } from "./rows-affected.js";
import { sessions } from "./schema/index.js";

describe("rowsAffected", () => {
  test("counts a libsql delete without reading a row back", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create();
    await db.insert(sessions).values([
      { id: "a", userId: user.id, expiresAt: new Date() },
      { id: "b", userId: user.id, expiresAt: new Date() },
    ]);

    expect(rowsAffected(await db.delete(sessions))).toBe(2);
  });

  // Hand-built result shapes: only the libsql case above runs a driver.
  test("counts a D1 result, which reports the same number elsewhere", () => {
    expect(
      rowsAffected({
        success: true,
        results: [],
        meta: { changes: 7, rows_read: 9, rows_written: 7 },
      }),
    ).toBe(7);
  });

  test("counts a better-sqlite3 result, which puts it at the top level", () => {
    expect(rowsAffected({ changes: 4, lastInsertRowid: 0 })).toBe(4);
  });

  test("refuses a result carrying no count rather than reporting none", () => {
    // What the demo runtime's `sqlite-proxy` adapter answers with.
    expect(() => rowsAffected({ rows: [] })).toThrow(DbError);
  });
});
