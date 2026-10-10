import type { AppContext } from "plumix/plugin";
import { sql } from "plumix/db";

/**
 * One statement per element. The index is external-content, so every delete
 * must name the old column values; the rowid-only shorthand corrupts it.
 */
export const SEARCH_INDEX_DDL: readonly string[] = [
  // Porter stems English so "running" finds "run". `remove_diacritics 2` folds
  // accents without splitting on the combining marks that `1` mishandles.
  `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    title,
    body,
    content='search_documents',
    content_rowid='id',
    tokenize='porter unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER IF NOT EXISTS search_documents_ai AFTER INSERT ON search_documents
  BEGIN
    INSERT INTO search_index (rowid, title, body)
    VALUES (new.id, new.title, new.body);
  END`,
  `CREATE TRIGGER IF NOT EXISTS search_documents_ad AFTER DELETE ON search_documents
  BEGIN
    INSERT INTO search_index (search_index, rowid, title, body)
    VALUES ('delete', old.id, old.title, old.body);
  END`,
  // Scoped to the indexed columns: stamping a new extractor version would
  // otherwise re-tokenize the whole corpus.
  `CREATE TRIGGER IF NOT EXISTS search_documents_au
   AFTER UPDATE OF title, body ON search_documents
  BEGIN
    INSERT INTO search_index (search_index, rowid, title, body)
    VALUES ('delete', old.id, old.title, old.body);
    INSERT INTO search_index (rowid, title, body)
    VALUES (new.id, new.title, new.body);
  END`,
];

/** The triggers by name, for anything taking them away before putting them
 *  back — or, in a test, for leaving the projection without an index. */
export const SEARCH_INDEX_TRIGGER_DROP_DDL: readonly string[] = [
  "DROP TRIGGER IF EXISTS search_documents_ai",
  "DROP TRIGGER IF EXISTS search_documents_ad",
  "DROP TRIGGER IF EXISTS search_documents_au",
];

/**
 * Replaces existing triggers, which `CREATE TRIGGER IF NOT EXISTS` would leave
 * in place.
 */
export const SEARCH_INDEX_TRIGGER_RESET_DDL: readonly string[] = [
  ...SEARCH_INDEX_TRIGGER_DROP_DDL,
  ...SEARCH_INDEX_DDL.filter((statement) =>
    statement.includes("CREATE TRIGGER"),
  ),
];

// Narrow so any drizzle db satisfies it, however a site widened its schema.
type SqlRunner = Pick<AppContext["db"], "run" | "all">;

const INDEX_OBJECTS = [
  "search_index",
  "search_documents_ai",
  "search_documents_ad",
  "search_documents_au",
] as const;

const INDEX_OBJECT_LIST = INDEX_OBJECTS.map((name) => `'${name}'`).join(", ");

/**
 * Ends a repair with an O(corpus) `'rebuild'`: an empty index over a populated
 * projection raises `SQLITE_CORRUPT` on the first update. Idempotent without a
 * lock, since D1 has none.
 */
export async function ensureSearchIndex(db: SqlRunner): Promise<void> {
  const present = await db.all<{ name: string; sql: string | null }>(
    sql.raw(
      `SELECT name, sql FROM sqlite_master WHERE name IN (${INDEX_OBJECT_LIST})`,
    ),
  );
  // An older update trigger, lacking `UPDATE OF`, re-tokenizes the corpus on
  // every roster change and survives `IF NOT EXISTS`, so check its SQL too.
  const stale = present.some(
    (row) =>
      row.name === "search_documents_au" &&
      row.sql !== null &&
      !row.sql.includes("UPDATE OF"),
  );
  if (stale) {
    for (const statement of SEARCH_INDEX_TRIGGER_RESET_DDL) {
      await db.run(sql.raw(statement));
    }
  }
  const missing = present.length !== INDEX_OBJECTS.length;
  if (missing) {
    for (const statement of SEARCH_INDEX_DDL) await db.run(sql.raw(statement));
  }
  if (missing || (await isIndexEmptyOverAProjection(db))) {
    await db.run(sql`INSERT INTO search_index(search_index) VALUES('rebuild')`);
  }
}

// Catches a repair that died between create and rebuild. Reads FTS5's
// `search_index_docsize` because an unmatched external-content table reads
// rows straight from the projection.
async function isIndexEmptyOverAProjection(db: SqlRunner): Promise<boolean> {
  const [state] = await db.all<{ indexed: number; projected: number }>(sql`
    SELECT EXISTS(SELECT 1 FROM search_index_docsize) AS indexed,
           EXISTS(SELECT 1 FROM search_documents) AS projected
  `);
  return state?.indexed === 0 && state.projected === 1;
}

// Anchored on the table, because the messages searched also carry SQL and
// visitor input.
const MISSING_INDEX = /no such table:\s*(?:main\.)?search_index\b/;

// How deep a driver may nest its causes before this stops looking. A `cause`
// that points at itself would otherwise be an infinite loop in a request.
const MAX_CAUSE_DEPTH = 8;

/**
 * Walks `cause`, since drivers expose only messages. Skips drizzle's wrapper,
 * whose message embeds bound parameters a visitor could fill with "no such
 * table".
 */
export function isMissingSearchIndex(error: unknown): boolean {
  let cause: unknown = error;
  for (
    let depth = 0;
    cause instanceof Error && depth < MAX_CAUSE_DEPTH;
    depth += 1
  ) {
    if (
      !cause.message.startsWith("Failed query:") &&
      MISSING_INDEX.test(cause.message)
    ) {
      return true;
    }
    cause = cause.cause;
  }
  return false;
}
