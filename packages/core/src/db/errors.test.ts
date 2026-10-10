import { describe, expect, test } from "vitest";

import {
  isUniqueConstraintError,
  isUniqueConstraintErrorOn,
} from "./errors.js";

describe("isUniqueConstraintError — driver shape coverage", () => {
  test("better-sqlite3: SqliteError with string `code`", () => {
    const err = Object.assign(
      new Error("UNIQUE constraint failed: users.email"),
      {
        code: "SQLITE_CONSTRAINT_UNIQUE",
      },
    );
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  test("better-sqlite3: PRIMARY KEY variant", () => {
    const err = Object.assign(new Error("UNIQUE constraint failed: t.id"), {
      code: "SQLITE_CONSTRAINT_PRIMARYKEY",
    });
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  test("node:sqlite (Node 22+): numeric extended `errcode` 2067", () => {
    // Whether Node's sqlite errcode is primary or extended depends on the
    // build; the next test covers the primary-code variant.
    const err = Object.assign(new Error("UNIQUE constraint failed: t.x"), {
      code: "ERR_SQLITE_ERROR",
      errcode: 2067,
    });
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  test("node:sqlite: primary `errcode` 19 falls through to message fallback", () => {
    // Code 19 alone also covers CHECK, FOREIGN KEY and NOT NULL, so only the
    // "UNIQUE constraint failed:" message separates UNIQUE.
    const err = Object.assign(new Error("UNIQUE constraint failed: t.x"), {
      code: "ERR_SQLITE_ERROR",
      errcode: 19,
    });
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  test("bun:sqlite: numeric `errno` 2067 (extended)", () => {
    // Bun before 1.0 returned only base code 19, detected through the
    // message fallback instead.
    const err = Object.assign(new Error("UNIQUE constraint failed"), {
      errno: 2067,
    });
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  test("libsql / LibsqlError: base `code` + message fallback", () => {
    const err = Object.assign(
      new Error("UNIQUE constraint failed: users.email"),
      { code: "SQLITE_CONSTRAINT" },
    );
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  test("Cloudflare D1: plain Error, no structured code", () => {
    const err = new Error(
      "D1_ERROR: UNIQUE constraint failed: users.email: SQLITE_CONSTRAINT",
    );
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  test("Deno @db/sqlite: message-only detection", () => {
    const err = new Error("UNIQUE constraint failed: users.email");
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  test("drizzle-orm wrap: 1-level .cause chain", () => {
    const inner = Object.assign(new Error("UNIQUE constraint failed"), {
      code: "SQLITE_CONSTRAINT_UNIQUE",
    });
    const wrapped = Object.assign(new Error("Failed query: insert ..."), {
      cause: inner,
    });
    expect(isUniqueConstraintError(wrapped)).toBe(true);
  });

  test("drizzle + libsql wrap: 2-level .cause chain", () => {
    const sqlite = new Error("UNIQUE constraint failed: users.email");
    const libsql = Object.assign(
      new Error("SQL_INPUT_ERROR: SQLite error: UNIQUE constraint failed"),
      { code: "SQLITE_CONSTRAINT", cause: sqlite },
    );
    const drizzle = Object.assign(new Error("Failed query"), { cause: libsql });
    expect(isUniqueConstraintError(drizzle)).toBe(true);
  });

  test("drizzle + D1 wrap: leaf is a plain Error with only a message", () => {
    // D1 leaves carry no structured code and Drizzle wraps them via
    // `.cause`, so only the leaf's message identifies them.
    const d1 = new Error(
      "D1_ERROR: UNIQUE constraint failed: users.email: SQLITE_CONSTRAINT",
    );
    const drizzle = Object.assign(
      new Error("Failed query: insert into users ..."),
      { cause: d1 },
    );
    expect(isUniqueConstraintError(drizzle)).toBe(true);
  });

  test("cycle guard: self-referential cause doesn't loop", () => {
    const err = new Error("not a constraint error");
    (err as unknown as { cause: unknown }).cause = err;
    expect(isUniqueConstraintError(err)).toBe(false);
  });
});

describe("isUniqueConstraintError — negatives", () => {
  test("unrelated SQLite error (CHECK constraint)", () => {
    const err = Object.assign(new Error("CHECK constraint failed"), {
      code: "SQLITE_CONSTRAINT_CHECK",
    });
    expect(isUniqueConstraintError(err)).toBe(false);
  });

  test("generic runtime error", () => {
    expect(isUniqueConstraintError(new Error("something went wrong"))).toBe(
      false,
    );
  });

  test("message substring without the colon anchor is rejected", () => {
    // The phrase appears mid-sentence without the SQLite "`UNIQUE
    // constraint failed:` table.col" shape — a human-written log line,
    // not a driver error.
    const err = new Error(
      "note: UNIQUE constraint failed would be a problem here",
    );
    expect(isUniqueConstraintError(err)).toBe(false);
  });

  test("non-error values", () => {
    expect(isUniqueConstraintError(undefined)).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError("UNIQUE constraint failed")).toBe(false);
    expect(isUniqueConstraintError(42)).toBe(false);
    expect(isUniqueConstraintError({})).toBe(false);
  });

  test("deep chain past the cap returns false", () => {
    // Build a cause chain 10 deep where only the tail is a unique violation.
    // The MAX_CAUSE_DEPTH=6 walk should not reach the tail.
    const tail = Object.assign(new Error("UNIQUE constraint failed"), {
      code: "SQLITE_CONSTRAINT_UNIQUE",
    });
    let head: Error = tail;
    for (let i = 0; i < 10; i++) {
      const wrapper = new Error(`wrapper-${i}`);
      (wrapper as unknown as { cause: unknown }).cause = head;
      head = wrapper;
    }
    expect(isUniqueConstraintError(head)).toBe(false);
  });
});

describe("isUniqueConstraintErrorOn — column-specific", () => {
  test("matches the named column, through a wrapped cause chain", () => {
    const driver = new Error("UNIQUE constraint failed: users.slug");
    const wrapped = new Error("Failed query: insert into users …");
    (wrapped as unknown as { cause: unknown }).cause = driver;
    expect(isUniqueConstraintErrorOn(wrapped, "users.slug")).toBe(true);
  });

  test("tells one column's violation apart from another's", () => {
    const err = new Error("UNIQUE constraint failed: users.email");
    expect(isUniqueConstraintErrorOn(err, "users.email")).toBe(true);
    expect(isUniqueConstraintErrorOn(err, "users.slug")).toBe(false);
  });

  test("non-error and code-only shapes are not column-attributable", () => {
    expect(isUniqueConstraintErrorOn(null, "users.slug")).toBe(false);
    // Code without the SQLite message carries no column identity.
    const codeOnly = Object.assign(new Error("insert failed"), {
      code: "SQLITE_CONSTRAINT_UNIQUE",
    });
    expect(isUniqueConstraintErrorOn(codeOnly, "users.slug")).toBe(false);
  });
});
