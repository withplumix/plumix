import type { AppContext } from "../context/app-context.js";
import type { AdminSearchInput, SearchGroup } from "./admin-search.js";
import { and, desc } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { entrySearchCondition } from "../db/search-conditions.js";
import { adminEntryScope, entryGroups } from "./admin-entry-scope.js";
import { tokenizeSearchQuery } from "./contract/search-terms.js";

/**
 * LIKE has no relevance ranking, so the most recently updated matches are
 * taken and bucketed.
 */
const SCAN_LIMIT = 50;

/**
 * Stays registered beside a search plugin, answering for whatever its index
 * doesn't hold. It is the floor, which is why it is the cheap query.
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
