import { describe, expect, test } from "vitest";

import { isUniqueConstraintError } from "./errors.js";

// Synthetic driver error shapes — each mirrors what the real driver emits
// for a UNIQUE violation. We keep them in-file so adding a new runtime
// is a one-row append, and a future regression (someone narrowing the
// detector) fails loud with a named driver.

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

  test("node:sqlite (Node 22+): numeric `errcode` 2067", () => {
    const err = Object.assign(new Error("UNIQUE constraint failed"), {
      code: "ERR_SQLITE_ERROR",
      errcode: 2067,
    });
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  test("bun:sqlite: numeric `errno` 2067 (extended)", () => {
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
