import type { SQL } from "plumix/db";
import type {
  AdminSearchInput,
  AppContext,
  MatchedEntry,
  PluginSetupContext,
  SearchGroup,
} from "plumix/plugin";
import { sql } from "plumix/db";
import { adminEntryScope, entryGroups } from "plumix/plugin";

import type { SearchOptions } from "./query.js";
import { isMissingSearchIndex } from "../db/ddl.js";
import { DEFAULT_RANKING_ALGORITHM, rankingWeights } from "../ranking.js";
import { toMatchExpression } from "./query-text.js";

/**
 * Core's entries handler runs at 10, and the lower number goes first — so
 * this claims the entry groups it can rank before core produces them.
 */
const HANDLER_PRIORITY = 5;

/**
 * Matches core's own scan cap across all types, so palette coverage is
 * unchanged.
 */
const SCAN_LIMIT = 50;

/**
 * Ranks on **edit** reach, stricter than core: `read` reaches subscribers, who
 * could probe hidden bodies word by word. Anything unanswered falls to core's
 * handler.
 */
export function registerAdminSearch(
  ctx: PluginSetupContext,
  options: Pick<SearchOptions, "ranking">,
): void {
  ctx.addFilter(
    "admin:search:results",
    (input, appCtx) => rankedEntryGroups(appCtx, input, options.ranking),
    { priority: HANDLER_PRIORITY },
  );
}

async function rankedEntryGroups(
  ctx: AppContext,
  input: AdminSearchInput,
  ranking: SearchOptions["ranking"] = DEFAULT_RANKING_ALGORITHM,
): Promise<readonly SearchGroup[]> {
  const match = toMatchExpression(input.query);
  if (match === null) return [];
  const scope = adminEntryScope(ctx, { reach: "edit" });
  if (scope === null) return [];

  const weights = rankingWeights(ranking);
  // Never the public recency plan: it walks `published_at`, which drafts lack.
  // Scoring a common word's whole match set is affordable on an authenticated
  // surface.
  const rows = await matched(
    ctx,
    sql`
    SELECT entries.type AS type,
           entries.id AS id,
           entries.title AS title,
           bm25(search_index, ${weights.title}, ${weights.body}) AS score
      FROM search_index
      JOIN search_documents AS documents ON documents.id = search_index.rowid
      JOIN entries
        ON documents.source_type = 'entry' AND entries.id = documents.source_id
     WHERE search_index MATCH ${match}
       AND ${scope.visible}
     ORDER BY score, documents.id
     LIMIT ${SCAN_LIMIT}
  `,
  );

  return entryGroups(scope, rows, input.limit);
}

/**
 * A missing index is silent here: the palette would log once per keystroke,
 * and the search page and scheduled run already report it.
 */
async function matched(
  ctx: AppContext,
  query: SQL,
): Promise<readonly MatchedEntry[]> {
  try {
    return await ctx.db.all<MatchedEntry>(query);
  } catch (error) {
    if (isMissingSearchIndex(error)) return [];
    throw error;
  }
}
