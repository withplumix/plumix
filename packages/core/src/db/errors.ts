// Each SQLite driver exposes a constraint violation in a different field,
// possibly wrapped in `.cause`; the message substring is the one thing every
// driver surfaces verbatim.

// Extended SQLite result codes for UNIQUE / PRIMARYKEY violations. See
// https://www.sqlite.org/rescode.html — "SQLITE_CONSTRAINT_UNIQUE" (2067)
// and "SQLITE_CONSTRAINT_PRIMARYKEY" (1555).
const CONSTRAINT_CODE_STRINGS = new Set([
  "SQLITE_CONSTRAINT_UNIQUE",
  "SQLITE_CONSTRAINT_PRIMARYKEY",
]);
const CONSTRAINT_CODE_NUMBERS = new Set([2067, 1555]);

// D1 through drizzle can stack four causes deep; the bound stops a driver's
// cause cycle from looping forever.
const MAX_CAUSE_DEPTH = 6;

// String fields hold extended-code names; number fields hold numeric extended
// codes (2067 / 1555).
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

  // D1 has no structured codes and relies entirely on this. Colon-anchored so
  // an unrelated wrapper message mentioning the phrase doesn't match.
  const message = err.message;
  if (
    typeof message === "string" &&
    message.includes("UNIQUE constraint failed:")
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

/**
 * Message-only, unlike `isUniqueConstraintError`: column identity rides only on
 * SQLite's `UNIQUE constraint failed: users.slug`.
 */
export function isUniqueConstraintErrorOn(
  error: unknown,
  qualifiedColumn: string,
): boolean {
  const needle = `UNIQUE constraint failed: ${qualifiedColumn}`;
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth++) {
    if (seen.has(current)) return false; // cycle guard
    seen.add(current);
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string" && message.includes(needle)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

type DbErrorCode = "no_row_count" | "visitor_namespace_missing";

/**
 * A database driver did not answer the way `plumix/db` needs it to.
 * Named-error convention (#232).
 */
export class DbError extends Error {
  static {
    DbError.prototype.name = "DbError";
  }

  readonly code: DbErrorCode;

  private constructor(code: DbErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  static noRowCount(fields: readonly string[]): DbError {
    return new DbError(
      "no_row_count",
      `This driver's write result carries no row count — expected ` +
        `${fields.map((field) => `"${field}"`).join(", ")}. A driver that ` +
        `reports none cannot use rowsAffected(); read the rows back instead.`,
    );
  }

  /**
   * A plugin built against the old three-argument `readVisitorMeta` passes its
   * request here; reading `undefined` would make hashes comparable across
   * plugins.
   */
  static visitorNamespaceMissing(): DbError {
    return new DbError(
      "visitor_namespace_missing",
      `readVisitorMeta needs a namespace: readVisitorMeta(ctx, { namespace }). ` +
        `A plugin built against readVisitorMeta(ctx, request, options) must ` +
        `drop the middle argument and be rebuilt against this version.`,
    );
  }
}
