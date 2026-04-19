// Unique-constraint detection across every SQLite driver plumix runs on:
// better-sqlite3 (Node), node:sqlite (Node 22+), bun:sqlite, libsql,
// Cloudflare D1, Deno's @db/sqlite. Each exposes the constraint violation
// in a different field; drizzle-orm may wrap the driver error with `.cause`
// N levels deep. The detector below checks every known shape and falls
// back to the SQLite-produced message substring, which is the one thing
// every driver surfaces verbatim.

// Extended SQLite result codes for UNIQUE / PRIMARYKEY violations. See
// https://www.sqlite.org/rescode.html — "SQLITE_CONSTRAINT_UNIQUE" (2067)
// and "SQLITE_CONSTRAINT_PRIMARYKEY" (1555).
const CONSTRAINT_CODE_STRINGS = new Set([
  "SQLITE_CONSTRAINT_UNIQUE",
  "SQLITE_CONSTRAINT_PRIMARYKEY",
]);
const CONSTRAINT_CODE_NUMBERS = new Set([2067, 1555]);

// Max depth of `.cause` walk. Drizzle-orm typically wraps once, libsql twice,
// D1-through-drizzle can stack three or four. Six gives us headroom without
// letting a pathological cycle (bug in a driver) loop forever.
const MAX_CAUSE_DEPTH = 6;

// Every field name we've seen a SQLite driver put the result code on.
// String fields hold extended-code strings ("SQLITE_CONSTRAINT_UNIQUE");
// number fields hold numeric extended codes (2067 / 1555). Adding a new
// driver is a one-row append to whichever list matches its shape.
const STRING_CODE_FIELDS = ["code", "extendedCode"] as const;
const NUMBER_CODE_FIELDS = ["errno", "errcode", "resultCode"] as const;

function hasUniqueCode(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;

  for (const field of STRING_CODE_FIELDS) {
    const value = err[field];
    if (typeof value === "string" && CONSTRAINT_CODE_STRINGS.has(value)) {
      return true;
    }
  }
  for (const field of NUMBER_CODE_FIELDS) {
    const value = err[field];
    if (typeof value === "number" && CONSTRAINT_CODE_NUMBERS.has(value)) {
      return true;
    }
  }

  // Universal fallback: SQLite's core produces "UNIQUE constraint failed: …"
  // verbatim; every driver we've audited includes it in the message.
  // Cloudflare D1 relies entirely on this path (no structured codes at all).
  const message = err.message;
  if (
    typeof message === "string" &&
    message.includes("UNIQUE constraint failed")
  ) {
    return true;
  }
  return false;
}

export function isUniqueConstraintError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth++) {
    if (seen.has(current)) return false; // cycle guard
    seen.add(current);
    if (hasUniqueCode(current)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
