import type { PluginDescriptor } from "plumix/plugin";
import { definePlugin } from "plumix";

import type { RankingAlgorithm } from "./ranking.js";
import { registerSearchArchive } from "./archive.js";
import { SEARCH_INDEX_DDL } from "./db/ddl.js";
import * as schema from "./db/schema.js";
import { drainEntryChanges } from "./server/drain.js";
import { registerEntryIndexInvalidator } from "./server/queue.js";

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
}

/**
 * `@plumix/plugin-search` — a maintained full-text index over everything a
 * site publishes.
 *
 * Installing it materializes a plain-text projection of every searchable
 * entry and an SQLite FTS5 index over that projection. Both boundaries where
 * the index could drift from the content are closed by triggers in the
 * database — core's change feed on one side, the projection's own triggers on
 * the other — so a seed, a migration or a bulk import cannot leave a site
 * with an index that quietly disagrees with its content. Only the middle hop
 * is JavaScript, because stripping HTML out of block content needs it.
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
    sqlMigrations: [{ name: "index", statements: SEARCH_INDEX_DDL }],
    setup: (ctx) => {
      registerEntryIndexInvalidator(ctx);
      registerSearchArchive(ctx, options.ranking);
      // No `cron`: a task that declares one runs only on an invocation whose
      // schedule matches it byte for byte, and how often a site's worker
      // wakes is the site's decision. Draining costs nothing when the feed is
      // empty, so the right cadence is whatever cadence the site already has.
      ctx.registerScheduledTask({
        id: "index-drain",
        handler: async (appCtx) => {
          const handled = await drainEntryChanges(appCtx);
          if (handled > 0) {
            appCtx.logger.info(
              `[plumix/plugin-search] indexed ${String(handled)} change${
                handled === 1 ? "" : "s"
              } from the entry feed`,
            );
          }
        },
      });
    },
  });
}
