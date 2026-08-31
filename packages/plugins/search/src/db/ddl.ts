import type { AppContext } from "plumix/plugin";
import { sql } from "plumix/db";

/**
 * The DDL drizzle cannot express: the FTS5 virtual table and the triggers
 * that keep it in step with the projection. Shipped as the plugin's raw SQL
 * migration and, statement for statement, as the runtime repair path, so
 * every test exercises the same statements production applies.
 *
 * The index is **external-content** over `search_documents`: it stores the
 * inverted terms and reads the text back from the projection. That is why
 * every delete has to name the old column values —
 * `VALUES('delete', rowid, title, body)`. The contentless shorthand, which
 * passes the rowid alone, is legal only on a `content=''` table; used here
 * it leaves the index's own bookkeeping describing terms it can no longer
 * find, and `integrity-check` starts failing on rows nobody touched again.
 *
 * One statement per entry — the callers that apply these run them one at a
 * time, and `wrangler d1 migrations apply` needs each `END` on its own line.
 */
export const SEARCH_INDEX_DDL: readonly string[] = [
  // Porter stems English, so "running" finds "run" — the difference between a
  // search that reads as working and one that hides results behind a word
  // form. `remove_diacritics 2` folds accents without splitting on the
  // combining marks that `1` mishandles.
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
  // Scoped to the two columns the index shadows. Stamping a document with a
  // new extractor version is not a change to its text, and firing here would
  // re-tokenize the whole corpus every time a block moved its declaration.
  `CREATE TRIGGER IF NOT EXISTS search_documents_au
   AFTER UPDATE OF title, body ON search_documents
  BEGIN
    INSERT INTO search_index (search_index, rowid, title, body)
    VALUES ('delete', old.id, old.title, old.body);
    INSERT INTO search_index (rowid, title, body)
    VALUES (new.id, new.title, new.body);
  END`,
];

/**
 * Replaces the triggers an install already has.
 *
 * A migration the journal carries is never emitted again, so correcting one
 * takes a second migration rather than an edit to the first. Shares its DDL
 * with the list above, so an install generating both for the first time
 * converges on the same triggers either way.
 */
export const SEARCH_INDEX_TRIGGER_RESET_DDL: readonly string[] = [
  "DROP TRIGGER IF EXISTS search_documents_ai",
  "DROP TRIGGER IF EXISTS search_documents_ad",
  "DROP TRIGGER IF EXISTS search_documents_au",
  ...SEARCH_INDEX_DDL.filter((statement) =>
    statement.includes("CREATE TRIGGER"),
  ),
];

/** Narrow enough that any drizzle db satisfies it, however a site has widened
 *  its schema — reading `sqlite_master` and running statements is all this
 *  needs. */
type SqlRunner = Pick<AppContext["db"], "run" | "all">;

const INDEX_OBJECTS = [
  "search_index",
  "search_documents_ai",
  "search_documents_ad",
  "search_documents_au",
] as const;

const INDEX_OBJECT_LIST = INDEX_OBJECTS.map((name) => `'${name}'`).join(", ");

/**
 * Repair the index and its triggers if any of them is absent. The projection
 * table itself is drizzle's, created by an ordinary migration — this covers
 * the half a migration cannot describe, for the install whose raw migration
 * never ran.
 *
 * Creating the objects is not enough on its own, and this is the trap: an
 * empty index over a populated projection passes `integrity-check`, and the
 * first update or delete on a row the index never held raises
 * `SQLITE_CORRUPT` — an external-content table is being told to unindex terms
 * that are not there. So a repair ends with `'rebuild'`, which repopulates
 * the index from the projection in one statement.
 *
 * That rebuild is O(corpus), which is why the whole thing is behind one
 * `sqlite_master` read: the case this exists for is rare, and the case that
 * is not rare has to cost a single cheap query. Idempotent without a lock,
 * because D1 has none and two isolates can arrive together.
 */
export async function ensureSearchIndex(db: SqlRunner): Promise<void> {
  const present = await db.all<{ name: string; sql: string | null }>(
    sql.raw(
      `SELECT name, sql FROM sqlite_master WHERE name IN (${INDEX_OBJECT_LIST})`,
    ),
  );
  // An install carrying the first version of the update trigger has all four
  // objects and the wrong one of them: `CREATE TRIGGER IF NOT EXISTS` would
  // leave it in place, so this repair would fix a missing index and walk past
  // a trigger that re-tokenizes the whole corpus on every roster change. Two
  // repair paths disagreeing about the right trigger is worse than either, so
  // this asks what is actually installed rather than only what is present.
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
  if (present.length === INDEX_OBJECTS.length) return;
  for (const statement of SEARCH_INDEX_DDL) await db.run(sql.raw(statement));
  await db.run(sql`INSERT INTO search_index(search_index) VALUES('rebuild')`);
}
