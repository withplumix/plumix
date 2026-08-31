import type { PluginDescriptor } from "plumix/plugin";
import { definePlugin } from "plumix";

import type { RankingAlgorithm } from "./ranking.js";
import { registerSearchArchive } from "./archive.js";
import { REINDEX_CAPABILITY, REINDEX_ROUTE_PATH } from "./contract.js";
import { SEARCH_INDEX_DDL, SEARCH_INDEX_TRIGGER_RESET_DDL } from "./db/ddl.js";
import * as schema from "./db/schema.js";
import { runSearchMaintenance } from "./server/drain.js";
import { registerIndexInvalidator } from "./server/queue.js";
import {
  handleReindexStart,
  handleReindexStatus,
} from "./server/reindex-route.js";

export type { SearchArchiveData } from "./archive.js";
export type { SearchResult } from "./server/query.js";
export type { RankingAlgorithm } from "./ranking.js";

export interface SearchConfig {
  /**
   * Which ranking algorithm orders the results. One exists, and its weights
   * are hardcoded — the name is what lets a future revision ship without
   * silently reordering the results a site already has.
   */
  readonly ranking?: RankingAlgorithm;
  /**
   * How many documents a word has to appear in before results for it are
   * ordered by recency rather than relevance. Defaults to where the two plans
   * were measured to cross; a site with a much smaller or much larger corpus
   * can move it.
   */
  readonly commonTermThreshold?: number;
}

/**
 * `@plumix/plugin-search` — a maintained full-text index over everything a
 * site publishes.
 *
 * Installing it materializes a plain-text projection of every searchable
 * entry and term, and an SQLite FTS5 index over that projection. For entries,
 * both boundaries where the index could drift from the content are closed by
 * triggers in the database — core's change feed on one side, the projection's
 * own triggers on the other — so a seed, a migration or a bulk import cannot
 * leave a site with an index that quietly disagrees with its content. Only the
 * middle hop is JavaScript, because stripping HTML out of block content needs
 * it.
 *
 * A term has no such feed: it is indexed through the lifecycle actions, and a
 * term the projection has never held is swept up by the scheduled run.
 *
 * An entry saved through the application is indexed after the response, so a
 * visitor never waits for it; anything the fast path misses is caught when
 * the feed is next drained.
 */
export function search(options: SearchConfig = {}): PluginDescriptor {
  return definePlugin("search", {
    schema,
    // Module specifier `plumix migrate generate` uses to fold the projection
    // into the host's drizzle-kit codegen.
    schemaModule: "@plumix/plugin-search/schema",
    // The FTS5 virtual table and its triggers, which drizzle-kit models
    // nothing of. Emitted after the schema diff, so they land behind the
    // table they shadow.
    sqlMigrations: [
      { name: "index", statements: SEARCH_INDEX_DDL },
      {
        name: "index_triggers",
        statements: SEARCH_INDEX_TRIGGER_RESET_DDL,
      },
    ],
    setup: (ctx) => {
      registerIndexInvalidator(ctx);
      ctx.registerCapability(REINDEX_CAPABILITY, "admin");
      // Routes rather than an RPC router: the plugin's own id is one of core's
      // reserved RPC namespaces, so `registerRpcRouter` is closed to it.
      ctx.registerRoute({
        method: "POST",
        path: REINDEX_ROUTE_PATH,
        auth: { capability: REINDEX_CAPABILITY },
        handler: (_request, appCtx) => handleReindexStart(appCtx),
      });
      ctx.registerRoute({
        method: "GET",
        path: REINDEX_ROUTE_PATH,
        auth: { capability: REINDEX_CAPABILITY },
        handler: (_request, appCtx) => handleReindexStatus(appCtx),
      });
      registerSearchArchive(ctx, options);
      // No `cron`: a task that declares one runs only on an invocation whose
      // schedule matches it byte for byte, and how often a site's worker
      // wakes is the site's decision. Draining costs nothing when the feed is
      // empty, so the right cadence is whatever cadence the site already has.
      ctx.registerScheduledTask({
        id: "index-drain",
        handler: runSearchMaintenance,
      });
    },
  });
}
