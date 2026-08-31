import type { User } from "plumix/schema";
import type { DispatcherHarness } from "plumix/test";
import { sql } from "plumix/db";
import { definePlugin, runScheduledTasks } from "plumix/plugin";
import {
  applyTestSchema,
  createDispatcherHarness,
  createTestContext,
  createTestDb,
  factoriesFor,
} from "plumix/test";

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

/**
 * The entry types a site under test publishes — core registers none, so a
 * suite that wants a searchable entry has to bring a plugin that does. The
 * `ledger` type is the one opted out, for asserting what never gets indexed.
 */
export const contentPlugin = definePlugin("content", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryType("ledger", {
      label: "Ledger",
      excludeFromSearch: true,
    });
  },
});

export interface SearchHarness {
  readonly h: DispatcherHarness;
  readonly admin: User;
  /** Run the scheduled trigger, so the index catches up with the feed. */
  readonly runSchedule: () => Promise<void>;
}

/** A dispatcher harness with the plugin's schema and index already applied. */
export async function createSearchHarness(
  options: Parameters<typeof createDispatcherHarness>[0] = {},
): Promise<SearchHarness> {
  const h = await createDispatcherHarness(options);
  await applySearchSchema(h.db);
  const admin = await h.seedUser("admin");
  return {
    h,
    admin,
    runSchedule: () =>
      runScheduledTasks(
        h.app,
        createTestContext({
          db: h.db,
          plugins: h.app.plugins,
          blocks: h.app.blocks,
          hooks: h.app.hooks,
        }),
      ),
  };
}

/**
 * Publish `count` entries carrying `words` and put each in the index, oldest
 * first. Writes the projection directly rather than running the extractor —
 * a suite asking what the index knows does not care how the text got there.
 */
export async function indexWords(
  db: SearchTestDb,
  count: number,
  ...words: readonly string[]
): Promise<readonly number[]> {
  const author = await factoriesFor(db).admin.create();
  const [last] = await db.all<{ id: number }>(
    sql`SELECT coalesce(max(id), 0) AS id FROM entries`,
  );
  const ids: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = (last?.id ?? 0) + i + 1;
    const entry = await factoriesFor(db).entry.create({
      authorId: author.id,
      status: "published",
      title: `Entry ${String(id)}`,
      slug: `entry-${String(id)}`,
      publishedAt: new Date(2000, 0, 1 + id),
    });
    await db.insert(schema.searchDocuments).values({
      sourceType: "entry",
      sourceId: entry.id,
      title: "",
      body: words.join(" "),
      extractorVersion: "v1",
    });
    ids.push(entry.id);
  }
  return ids;
}
