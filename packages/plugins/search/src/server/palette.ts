import type { SQL } from "plumix/db";
import type {
  AdminSearchInput,
  AppContext,
  MatchedEntry,
  PluginSetupContext,
  SearchGroup,
} from "plumix/plugin";
import { adminEntryScope, entryGroups } from "plumix";
import { sql } from "plumix/db";

import type { SearchOptions } from "./query.js";
import { isMissingSearchIndex } from "../db/ddl.js";
import { DEFAULT_RANKING_ALGORITHM, rankingWeights } from "../ranking.js";
import { toMatchExpression } from "./query-text.js";

// Core's entries handler runs at 10, and the lower number goes first — so
// this claims the entry groups it can rank before core produces them.
const HANDLER_PRIORITY = 5;

// Max rows read across every type for one query, then bucketed. Matches
// core's own scan cap, so a type whose best match is far down the list is
// missing from the palette for the same reason it was before.
const SCAN_LIMIT = 50;

/**
 * Replace the palette's entries domain with one the index ranks.
 *
 * The gating is core's own: `adminEntryScope` decides which types this caller
 * may reach and which of their rows they may be shown, and both handlers
 * build on it, so a draft cannot be visible here and hidden there.
 *
 * It is asked for the **edit** reach, and that is the one thing here that is
 * stricter than core's handler. A ranked result is a body-text match, so
 * answering one says a word appears somewhere inside an entry — and
 * `entry:<type>:read` bottoms out at the subscriber tier, which on a site
 * with open signup every reader holds for every registered type. Since this
 * change also puts the types a site hid from public search into the index,
 * ranking on `read` would let a signed-up reader probe those bodies a word at
 * a time. Core's title-and-excerpt handler still answers them.
 *
 * The rest of what this cannot answer, it simply does not: a type under an
 * access policy is never in the index, an entry not yet projected has no
 * document, and nothing at all is there before the index has been built.
 * Each is a group core fills the rest of instead. A half-typed word is the
 * same story — the index matches whole terms, so an editor mid-word is
 * answered by core's substring match until the word is finished.
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
  // Always the ranked plan, never the recency one the public page falls back
  // to for a very common word: that plan walks `published_at`, which a draft
  // does not have, and finding an author's own unpublished work is the case
  // this exists for. So a very common word costs what scoring its whole match
  // set costs — FTS5 scores before the limit applies — which is a price an
  // authenticated admin surface can pay where a public page cannot, and the
  // alternative here is not a slower answer but a wrong one.
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
 * Run the ranked query, treating a missing index as no matches.
 *
 * Quietly, unlike the search page, which says so out loud and repairs the
 * index behind the response. An operator hears it from there and from the
 * scheduled run, which repairs it too — and a palette that logged would log
 * once per keystroke. Any other fault still throws, and the palette's own
 * isolation records it.
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
