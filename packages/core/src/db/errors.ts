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

function hasUniqueCode(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    code?: unknown;
    extendedCode?: unknown;
    errno?: unknown;
    errcode?: unknown;
    resultCode?: unknown;
    message?: unknown;
  };
  // String codes — better-sqlite3 uses `code`; some drivers use `extendedCode`.
  if (typeof err.code === "string" && CONSTRAINT_CODE_STRINGS.has(err.code)) {
    return true;
  }
  if (
    typeof err.extendedCode === "string" &&
    CONSTRAINT_CODE_STRINGS.has(err.extendedCode)
  ) {
    return true;
  }
  // Numeric codes — node:sqlite exposes `errcode`, some drivers use `errno`
  // or `resultCode`. Accept any of the three.
  if (typeof err.errno === "number" && CONSTRAINT_CODE_NUMBERS.has(err.errno)) {
    return true;
  }
  if (
    typeof err.errcode === "number" &&
    CONSTRAINT_CODE_NUMBERS.has(err.errcode)
  ) {
    return true;
  }
  if (
    typeof err.resultCode === "number" &&
    CONSTRAINT_CODE_NUMBERS.has(err.resultCode)
  ) {
    return true;
  }
  // Universal fallback: SQLite's core produces "UNIQUE constraint failed: …"
  // verbatim; every driver we've audited includes it in the message.
  // Cloudflare D1 relies entirely on this path (no structured codes at all).
  if (
    typeof err.message === "string" &&
    err.message.includes("UNIQUE constraint failed")
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
