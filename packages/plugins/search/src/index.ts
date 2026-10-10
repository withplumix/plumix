import type { PluginDescriptor } from "plumix/plugin";
import { definePlugin } from "plumix/plugin";

import type { RankingAlgorithm } from "./ranking.js";
import { registerSearchArchive } from "./archive.js";
import { REINDEX_CAPABILITY, REINDEX_ROUTE_PATH } from "./contract.js";
import * as schema from "./db/schema.js";
import { runSearchMaintenance } from "./server/drain.js";
import { registerAdminSearch } from "./server/palette.js";
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
   * Pinning a name lets a future revision ship without silently reordering this
   * site's results.
   */
  readonly ranking?: RankingAlgorithm;
  /**
   * Document count past which a word's results order by recency rather than
   * relevance. The default is where the two plans were measured to cross.
   */
  readonly commonTermThreshold?: number;
}

/**
 * Entry indexing is closed by database triggers, so seeds and bulk imports
 * cannot leave it stale. Terms have no feed; the scheduled run sweeps them.
 */
export function search(options: SearchConfig = {}): PluginDescriptor {
  return definePlugin("search", {
    schema,
    // Names this package as the owner of the projection's tables, whose
    // history (FTS5 index and triggers included) ships in `migrations/`.
    schemaModule: "@plumix/plugin-search/schema",
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
      registerAdminSearch(ctx, options);
      // No `cron`: a declared one runs only on a byte-identical schedule, and
      // draining an empty feed is free, so any cadence the site has will do.
      ctx.registerScheduledTask({
        id: "index-drain",
        handler: runSearchMaintenance,
      });
    },
  });
}
