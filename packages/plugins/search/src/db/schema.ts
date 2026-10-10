import { sql } from "drizzle-orm";
import { sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Entries and terms share one table because bm25 scores are not comparable
 * across tables.
 */
const SEARCH_SOURCE_TYPES = ["entry", "term"] as const;

/** What a search result is — the discriminator a theme renders on. */
export type SearchSourceType = (typeof SEARCH_SOURCE_TYPES)[number];

/**
 * Holds drafts and trash, so public queries must clamp to published. Users and
 * form submissions are deliberately absent: a forgotten predicate cannot leak
 * them.
 */
export const searchDocuments = sqliteTable(
  "search_documents",
  (t) => ({
    // The FTS5 index's `content_rowid`, so this is the rowid alias rather
    // than a column beside it.
    id: t.integer().primaryKey({ autoIncrement: true }),
    sourceType: t.text({ enum: SEARCH_SOURCE_TYPES }).notNull(),
    /**
     * No foreign key: polymorphic, and the next index write drops an orphan.
     */
    sourceId: t.integer().notNull(),
    title: t.text().notNull(),
    body: t.text().notNull(),
    extractorVersion: t.text().notNull(),
  }),
  (table) => [
    // Unique: SQLite's `ON CONFLICT` needs it, and it stops racing isolates
    // leaving two documents for one entry.
    uniqueIndex("search_documents_source_idx").on(
      table.sourceType,
      table.sourceId,
    ),
  ],
);

export type NewSearchDocument = typeof searchDocuments.$inferInsert;

/**
 * At most one `running` at a time. `completed_with_errors` walked everything
 * but skipped some sources; `failed` stopped early.
 */
export const REINDEX_STATUSES = [
  "running",
  "succeeded",
  "completed_with_errors",
  "failed",
] as const;

export type ReindexStatus = (typeof REINDEX_STATUSES)[number];

/**
 * The walk is chunked across scheduled runs (backfill measured ~1 300
 * entries/s), so an isolate dying mid-chunk loses the chunk, not the run.
 * Finished rows are kept.
 */
export const searchReindexRuns = sqliteTable("search_reindex_runs", (t) => ({
  id: t.integer().primaryKey({ autoIncrement: true }),
  status: t.text({ enum: REINDEX_STATUSES }).notNull(),
  /**
   * One position across kinds taken in turn: everything of `cursorType` up to
   * `cursorId` is done.
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
