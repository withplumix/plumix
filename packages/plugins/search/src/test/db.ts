import { sql } from "plumix/db";
import { applyTestSchema, createTestDb } from "plumix/test";

import { ensureSearchIndex } from "../db/ddl.js";
import * as schema from "../db/schema.js";

export type SearchTestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * Layer the plugin's projection and its FTS5 index onto an existing core
 * test db — the one inside `createDispatcherHarness`, or a bare one below.
 *
 * The index half goes on through `ensureSearchIndex`, the same function the
 * runtime self-heals with, so every suite exercises that path rather than
 * leaving it the one branch nothing runs.
 */
export async function applySearchSchema(db: SearchTestDb): Promise<void> {
  await applyTestSchema(db, schema);
  await ensureSearchIndex(db);
}

export async function createSearchTestDb(): Promise<SearchTestDb> {
  const db = await createTestDb();
  await applySearchSchema(db);
  return db;
}

/**
 * The entries the index matches for `term`, in id order — the one question
 * the projection exists to answer, asked the way the query surface will.
 */
export async function indexedSourceIds(
  db: SearchTestDb,
  term: string,
): Promise<number[]> {
  const rows = await db.all<{ sourceId: number }>(sql`
    SELECT documents.source_id AS sourceId
      FROM search_index
      JOIN search_documents AS documents ON documents.id = search_index.rowid
     WHERE search_index MATCH ${term}
     ORDER BY documents.source_id
  `);
  return rows.map((row) => row.sourceId);
}

/** Throws unless the index's own bookkeeping still describes its content. */
export async function assertIndexIntact(db: SearchTestDb): Promise<void> {
  await db.run(
    sql`INSERT INTO search_index(search_index) VALUES('integrity-check')`,
  );
}

/**
 * Start recording every rewrite of a document, and answer with a reader for
 * what has been recorded. An `AFTER UPDATE` on the projection is exactly what
 * re-tokenizes a document, so counting them counts the work the write guard
 * exists to avoid.
 */
export async function watchRewrites(
  db: SearchTestDb,
): Promise<() => Promise<number[]>> {
  await db.run(sql`CREATE TABLE rewrites (source_id INTEGER)`);
  await db.run(sql`
    CREATE TRIGGER rewrite_spy AFTER UPDATE ON search_documents
    BEGIN INSERT INTO rewrites VALUES (new.source_id); END
  `);
  return async () => {
    const rows = await db.all<{ sourceId: number }>(
      sql`SELECT source_id AS sourceId FROM rewrites`,
    );
    return rows.map((row) => row.sourceId);
  };
}

/** One rich-text block holding `html` — the shape a seeded entry's body takes. */
export function paragraph(html: string): {
  readonly id: string;
  readonly name: string;
  readonly attrs: { readonly body: string };
} {
  return { id: "a", name: "core/rich-text", attrs: { body: html } };
}
