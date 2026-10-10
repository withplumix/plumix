import { fileURLToPath } from "node:url";
import type {
  AppContext,
  MutablePluginRegistry,
  SearchGroup,
} from "plumix/plugin";
import type { ScheduledRunReport } from "plumix/runtime";
import type { User } from "plumix/schema";
import type { DispatcherHarness } from "plumix/test";
import { coreBlocks, createBlockRegistry } from "plumix/blocks";
import { sql } from "plumix/db";
import { text, textarea } from "plumix/fields";
import { createPluginRegistry, definePlugin } from "plumix/plugin";
import { runScheduledTasks } from "plumix/runtime";
import { entries } from "plumix/schema";
import {
  applyTestSchema,
  createDeferQueue,
  createDispatcherHarness,
  createTestContext,
  createTestDb,
  factoriesFor,
  toRegisteredEntryType,
  toRegisteredTermTaxonomy,
} from "plumix/test";

import { SEARCH_INDEX_TRIGGER_DROP_DDL } from "../db/ddl.js";
import * as schema from "../db/schema.js";

export type SearchTestDb = DispatcherHarness["db"];

/** The history this package ships, at its root. */
const migrations = fileURLToPath(new URL("../../migrations", import.meta.url));

/**
 * Apply the plugin's shipped migration history — the projection, then its
 * FTS5 index and triggers — onto an existing core test db: the one inside
 * `createDispatcherHarness`, or a bare one below.
 */
export async function applySearchSchema(db: SearchTestDb): Promise<void> {
  await applyTestSchema(db, migrations);
}

/**
 * The shape of an install whose migration never ran. Triggers go too: one
 * left behind would fail every projection write, a different fault.
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
 * Scoped to `title` and `body` like the index's update trigger; an unscoped
 * spy would also count extractor-version stamps, which never reach FTS5.
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

/**
 * One rich-text block holding `html` — the shape a seeded entry's body takes.
 */
export function paragraph(html: string): {
  readonly id: string;
  readonly name: string;
  readonly attrs: { readonly body: string };
} {
  return { id: "a", name: "core/rich-text", attrs: { body: html } };
}

/**
 * Core registers no entry types. `ledger` is opted out of search; the meta
 * box has an opted-in, a silent, and a capability-gated field.
 */
export const contentPlugin = definePlugin("content", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryMetaBox("extras", {
      label: "Extras",
      entryTypes: ["post"],
      fields: [
        text("subtitle").searchable(),
        text("internalRef"),
        textarea("editorialNote").capability("editorial:manage").searchable(),
      ],
    });
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
  /**
   * Run the scheduled trigger, so the index catches up with the feed —
   * resolving to what the firing did.
   */
  readonly runSchedule: () => Promise<ScheduledRunReport>;
  /** Call an oRPC procedure as the admin, the way the editor's client does. */
  readonly rpc: (
    procedure: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  /** What the admin command palette shows `as` — the admin by default. */
  readonly palette: (
    query: string,
    as?: User,
  ) => Promise<readonly PaletteGroup[]>;
}

/** A palette group over the wire, narrowed to what a suite asserts on. */
export type PaletteGroup = Pick<SearchGroup, "key" | "items">;

/** A dispatcher harness with the plugin's schema and index already applied. */
export async function createSearchHarness(
  options: Parameters<typeof createDispatcherHarness>[0] = {},
): Promise<SearchHarness> {
  const h = await createDispatcherHarness(options);
  await applySearchSchema(h.db);
  const admin = await h.seedUser("admin");
  const call = async <T>(
    procedure: string,
    input: Record<string, unknown>,
    as: User,
  ): Promise<T> => {
    const response = await h.fetch(`/_plumix/rpc/${procedure}`, {
      method: "POST",
      json: { json: input },
      as,
    });
    response.assertStatus(200);
    // oRPC answers in its own envelope; every caller here wants the payload.
    const body = await response.json<{ json: T }>();
    return body.json;
  };
  return {
    h,
    admin,
    rpc: (procedure, input) => call(procedure, input, admin),
    palette: (query, as = admin) =>
      call<readonly PaletteGroup[]>("search/query", { query }, as),
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
 * One statement per table: a round trip per entry overran vitest's timeout
 * under CI contention. At 11 bound parameters per entry, this holds to
 * roughly 2900 entries.
 */
export async function indexWords(
  db: SearchTestDb,
  count: number,
  ...words: readonly string[]
): Promise<void> {
  const factories = factoriesFor(db);
  const author = await factories.admin.create();
  const [last] = await db.all<{ id: number }>(
    sql`SELECT coalesce(max(id), 0) AS id FROM entries`,
  );
  const first = (last?.id ?? 0) + 1;
  const created = await db
    .insert(entries)
    .values(
      Array.from({ length: count }, (_, i) => {
        const id = first + i;
        return factories.entry.build({
          authorId: author.id,
          status: "published",
          title: `Entry ${String(id)}`,
          slug: `entry-${String(id)}`,
          publishedAt: new Date(2000, 0, 1 + id),
        });
      }),
    )
    .returning();
  const body = words.join(" ");
  await db.insert(schema.searchDocuments).values(
    created.map((entry) => ({
      sourceType: "entry" as const,
      sourceId: entry.id,
      title: "",
      body,
      extractorVersion: "v1",
    })),
  );
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
 * A real `AppContext` with one entry type, one taxonomy and an author
 * registered.
 */
export async function createSearchContext(): Promise<SearchContext> {
  const db = await createSearchTestDb();
  const plugins = createPluginRegistry();
  plugins.entryTypes.set(
    "post",
    toRegisteredEntryType("post", { label: "Posts" }, "test"),
  );
  plugins.termTaxonomies.set(
    "category",
    toRegisteredTermTaxonomy("category", { label: "Categories" }, "test"),
  );
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
