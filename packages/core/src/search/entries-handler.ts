import type { AppContext } from "../context/app.js";
import type { AdminSearchInput, SearchGroup } from "./admin-search.js";
import { and, desc } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { tokenizeSearchQuery } from "../rpc/procedures/entry/search-terms.js";
import { adminEntryScope, entryGroups } from "./admin-entry-scope.js";
import { entrySearchCondition } from "./conditions.js";

// Max rows scanned across all types for one query. Title+excerpt LIKE has
// no relevance ranking, so we take the most recently updated matches and
// bucket them; a search plugin claims the groups it can rank instead.
const SCAN_LIMIT = 50;

/**
 * `admin:search:results` handler for the `entries` domain. Matches
 * title+excerpt (LIKE) across every entry type the caller can read, in a
 * single query, and returns one group per type. Drafts are included only
 * for types the caller can edit-any; everything is capped per group.
 *
 * Stays registered when a search plugin is installed, and keeps answering
 * for whatever the plugin's index does not hold — a type under an access
 * policy, which never enters that index, and every type at all when the
 * index is missing. Which is why this is the cheap query rather than a
 * better one: it is the floor, not the ceiling.
 */
export async function entriesSearchHandler(
  input: AdminSearchInput,
  ctx: AppContext,
): Promise<readonly SearchGroup[]> {
  const tokens = tokenizeSearchQuery(input.query);
  if (tokens.length === 0) return [];

  const scope = adminEntryScope(ctx);
  if (scope === null) return [];

  const rows = await ctx.db
    .select({ id: entries.id, type: entries.type, title: entries.title })
    .from(entries)
    .where(and(scope.visible, ...tokens.map(entrySearchCondition)))
    .orderBy(desc(entries.updatedAt))
    .limit(SCAN_LIMIT);

  return entryGroups(scope, rows, input.limit);
}
