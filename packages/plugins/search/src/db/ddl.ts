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
  `CREATE TRIGGER IF NOT EXISTS search_documents_au AFTER UPDATE ON search_documents
  BEGIN
    INSERT INTO search_index (search_index, rowid, title, body)
    VALUES ('delete', old.id, old.title, old.body);
    INSERT INTO search_index (rowid, title, body)
    VALUES (new.id, new.title, new.body);
  END`,
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
  const present = await db.all<{ name: string }>(
    sql.raw(
      `SELECT name FROM sqlite_master WHERE name IN (${INDEX_OBJECT_LIST})`,
    ),
  );
  if (present.length === INDEX_OBJECTS.length) return;
  for (const statement of SEARCH_INDEX_DDL) await db.run(sql.raw(statement));
  await db.run(sql`INSERT INTO search_index(search_index) VALUES('rebuild')`);
}
