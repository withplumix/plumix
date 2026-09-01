import type { AppContext, MutablePluginRegistry } from "plumix/plugin";
import type { User } from "plumix/schema";
import type { DispatcherHarness } from "plumix/test";
import { coreBlocks, createBlockRegistry } from "plumix/blocks";
import { sql } from "plumix/db";
import {
  createPluginRegistry,
  definePlugin,
  runScheduledTasks,
} from "plumix/plugin";
import {
  applyTestSchema,
  createDeferQueue,
  createDispatcherHarness,
  createTestContext,
  createTestDb,
  factoriesFor,
} from "plumix/test";

import { ensureSearchIndex, SEARCH_INDEX_TRIGGER_DROP_DDL } from "../db/ddl.js";
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

/**
 * Take the index and its triggers away, leaving the projection behind — the
 * shape an install has when the plugin's raw SQL migration never ran.
 *
 * The triggers go with the table because they write to it: leaving one behind
 * would make every projection write fail, which is a different fault from the
 * one the repair path exists for.
 */
export async function dropSearchIndex(db: SearchTestDb): Promise<void> {
  for (const statement of [
    ...SEARCH_INDEX_TRIGGER_DROP_DDL,
    "DROP TABLE IF EXISTS search_index",
  ]) {
    await db.run(sql.raw(statement));
  }
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
 * Start recording every re-tokenization, and answer with a reader for what has
 * been recorded.
 *
 * Scoped to `title` and `body` exactly as the index's own update trigger is,
 * so it counts the work that actually reaches FTS5. An unscoped spy would also
 * catch a document being stamped with a new extractor version, which is a
 * write to the projection and deliberately not a write to the index.
 */
export async function watchRewrites(
  db: SearchTestDb,
): Promise<() => Promise<number[]>> {
  await db.run(sql`CREATE TABLE rewrites (source_id INTEGER)`);
  await db.run(sql`
    CREATE TRIGGER rewrite_spy AFTER UPDATE OF title, body ON search_documents
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
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      entryTypes: ["post"],
    });
    // Not public, so its terms stay out of results with nothing else said —
    // the case the taxonomy switch exists for.
    ctx.registerTermTaxonomy("nav-menu", {
      label: "Menus",
      isPublic: false,
    });
  },
});

export interface SearchHarness {
  readonly h: DispatcherHarness;
  readonly admin: User;
  /** Run the scheduled trigger, so the index catches up with the feed. */
  readonly runSchedule: () => Promise<void>;
  /** Call an oRPC procedure as the admin, the way the editor's client does. */
  readonly rpc: (
    procedure: string,
    input: Record<string, unknown>,
  ) => Promise<void>;
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
    rpc: async (procedure, input) => {
      const response = await h.fetch(`/_plumix/rpc/${procedure}`, {
        method: "POST",
        json: { json: input },
        as: admin,
      });
      response.assertStatus(200);
    },
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

interface SearchContext {
  readonly db: SearchTestDb;
  readonly ctx: AppContext;
  /** Mutable, so a suite can retype or exclude what it registered. */
  readonly plugins: MutablePluginRegistry;
  readonly authorId: number;
  /** Settle the work the context deferred, so a suite can assert on it. */
  readonly drainDeferred: () => Promise<void>;
}

/**
 * A real `AppContext` over a search test db, with one entry type and one
 * taxonomy registered and an author to hang entries on — what every suite
 * that calls a server function directly opens with.
 */
export async function createSearchContext(): Promise<SearchContext> {
  const db = await createSearchTestDb();
  const plugins = createPluginRegistry();
  plugins.entryTypes.set("post", {
    name: "post",
    registeredBy: "test",
    label: "Posts",
  });
  plugins.termTaxonomies.set("category", {
    name: "category",
    registeredBy: "test",
    label: "Categories",
  });
  const { defer, drainDeferred } = createDeferQueue();
  const ctx = createTestContext({
    db,
    plugins,
    blocks: createBlockRegistry([...coreBlocks]),
    defer,
  });
  const author = await factoriesFor(db).admin.create();
  return { db, ctx, plugins, authorId: author.id, drainDeferred };
}
