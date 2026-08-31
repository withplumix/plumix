import { sql } from "drizzle-orm";
import { sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * What a document's text was extracted from. Entries and terms share one
 * table rather than having one each, so a query produces one ranked list —
 * bm25 scores are not comparable across tables, and merging per-source
 * results would force offset pagination on top.
 */
const SEARCH_SOURCE_TYPES = ["entry", "term"] as const;

/** What a search result is — the discriminator a theme renders on. */
export type SearchSourceType = (typeof SEARCH_SOURCE_TYPES)[number];

/**
 * The plain text of one searchable thing, materialized from whatever holds
 * the real content. Entry content is a block tree whose rich-text inputs
 * carry HTML strings, and SQLite has no regular expressions — so no trigger
 * can strip tags and the extraction has to happen in JavaScript, once, here.
 *
 * `title` and `body` are the two columns the FTS5 index shadows, by name:
 * the index is external-content over this table (see `db/ddl.ts`), so this
 * row is the only copy of the text and the index holds nothing but the
 * inverted terms. Rebuilding the index is then one SQL statement, where a
 * self-contained index would mean re-running the extractor over every
 * stored block tree.
 *
 * `extractor_version` is the tag the block roster hashes to. It is stored
 * per row so a row extracted by an older roster is distinguishable from a
 * current one, and so a roster change is a real difference to the write
 * guard rather than a no-op.
 *
 * Users and form submissions are deliberately absent. They are personal
 * data, and a predicate a public query forgets cannot leak what the table
 * never held.
 *
 * Drafts and trashed entries are not absent, and the same argument does not
 * reach them: an author has to be able to find their own unpublished work in
 * the admin, so the index has to hold it and the public query has to clamp to
 * published. What is private about a draft is who may read it, not that it
 * exists.
 */
export const searchDocuments = sqliteTable(
  "search_documents",
  (t) => ({
    // The FTS5 index's `content_rowid`, so this is the rowid alias rather
    // than a column beside it.
    id: t.integer().primaryKey({ autoIncrement: true }),
    sourceType: t.text({ enum: SEARCH_SOURCE_TYPES }).notNull(),
    /** The source row's id — an entry's id when `source_type` is `entry`. A
     *  polymorphic pair carries no foreign key, and would not want one: a
     *  document outlives its source by exactly as long as it takes the next
     *  index write to drop it. */
    sourceId: t.integer().notNull(),
    title: t.text().notNull(),
    body: t.text().notNull(),
    extractorVersion: t.text().notNull(),
  }),
  (table) => [
    // Unique because it is the upsert's conflict target, and SQLite matches
    // `ON CONFLICT (…)` only against a PRIMARY KEY or a UNIQUE index — a
    // plain one is rejected outright. It earns the constraint anyway: two
    // isolates racing the same entry would otherwise leave two documents for
    // it, and a search would return that entry twice.
    uniqueIndex("search_documents_source_idx").on(
      table.sourceType,
      table.sourceId,
    ),
  ],
);

export type NewSearchDocument = typeof searchDocuments.$inferInsert;

/**
 * Where a reindex run ended up. `running` is the only one that is not final,
 * and there is at most one of it at a time.
 *
 * `completed_with_errors` is separate from `failed` because they call for
 * different things: the first walked the whole corpus and could not project
 * some of it, the second stopped early. An operator who cannot tell them
 * apart cannot tell "mostly fine" from "start again".
 */
export const REINDEX_STATUSES = [
  "running",
  "succeeded",
  "completed_with_errors",
  "failed",
] as const;

export type ReindexStatus = (typeof REINDEX_STATUSES)[number];

/**
 * One rebuild of the index from its sources, and how far it got.
 *
 * A full reindex is far too much work for one invocation — measured backfill
 * runs at about 1 300 entries a second, so a large site is minutes of it — so
 * the walk is chunked across scheduled runs and its position is a row rather
 * than a variable. Everything a resumed run needs is here: an isolate that
 * dies mid-chunk loses the chunk, not the run.
 *
 * Rows are kept after they finish. The last one is what an operator reads to
 * find out whether the rebuild they started actually worked.
 */
export const searchReindexRuns = sqliteTable("search_reindex_runs", (t) => ({
  id: t.integer().primaryKey({ autoIncrement: true }),
  status: t.text({ enum: REINDEX_STATUSES }).notNull(),
  /**
   * Where the walk resumes. The kinds are taken in turn, so the pair is a
   * position in one ordering rather than two independent counters: everything
   * of `cursor_type` up to and including `cursor_id` is done.
   */
  cursorType: t.text({ enum: SEARCH_SOURCE_TYPES }).notNull(),
  cursorId: t.integer().notNull().default(0),
  /** Sources projected, and sources this run could not project. */
  processed: t.integer().notNull().default(0),
  failed: t.integer().notNull().default(0),
  startedAt: t
    .integer({ mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: t
    .integer({ mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => sql`(unixepoch())`),
  finishedAt: t.integer({ mode: "timestamp" }),
}));

export type SearchReindexRun = typeof searchReindexRuns.$inferSelect;
