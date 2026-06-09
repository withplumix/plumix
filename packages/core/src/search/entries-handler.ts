import type { AppContext } from "../context/app.js";
import type { SQL } from "../db/index.js";
import type { SearchTerm } from "../rpc/procedures/entry/search-terms.js";
import type {
  AdminSearchInput,
  SearchGroup,
  SearchResultItem,
} from "./admin-search.js";
import { and, desc, eq, not, or, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { entryCapability } from "../rpc/procedures/entry/lifecycle.js";
import {
  escapeLikePattern,
  tokenizeSearchQuery,
} from "../rpc/procedures/entry/search-terms.js";

// Max rows scanned across all types for one query. Title+excerpt LIKE has
// no relevance ranking, so we take the most recently updated matches and
// bucket them; a search plugin replaces this handler with real ranking.
const SCAN_LIMIT = 50;
// Group priority base; terms (100..) and later domains sort after Content.
const PRIORITY_BASE = 10;

/**
 * `admin:search:results` handler for the `entries` domain. Matches
 * title+excerpt (LIKE) across every entry type the caller can read, in a
 * single query, and returns one group per type. Drafts are included only
 * for types the caller can edit-any; everything is capped per group.
 */
export async function entriesSearchHandler(
  input: AdminSearchInput,
  ctx: AppContext,
): Promise<readonly SearchGroup[]> {
  const tokens = tokenizeSearchQuery(input.query);
  if (tokens.length === 0) return [];

  const readable = [...ctx.plugins.entryTypes.entries()].filter(([type]) =>
    ctx.auth.can(entryCapability(type, "read")),
  );
  if (readable.length === 0) return [];

  // Mirror `canReadEntry`'s visibility, minus trash (a browse surface
  // hides the bin, like the entries list default): published is always
  // visible; `edit_any` sees any non-trash; `edit_own` additionally sees
  // its own non-trash; everyone else sees published only.
  const userId = ctx.user?.id ?? null;
  const notTrash = not(eq(entries.status, "trash"));
  const typeClauses = readable.map(([type]) => {
    const ofType = eq(entries.type, type);
    if (ctx.auth.can(entryCapability(type, "edit_any"))) {
      return and(ofType, notTrash);
    }
    if (userId !== null && ctx.auth.can(entryCapability(type, "edit_own"))) {
      return and(
        ofType,
        notTrash,
        or(eq(entries.status, "published"), eq(entries.authorId, userId)),
      );
    }
    return and(ofType, eq(entries.status, "published"));
  });

  const rows = await ctx.db
    .select({ id: entries.id, type: entries.type, title: entries.title })
    .from(entries)
    .where(and(or(...typeClauses), ...tokens.map(titleExcerptCondition)))
    .orderBy(desc(entries.updatedAt))
    .limit(SCAN_LIMIT);

  const byType = new Map<string, SearchResultItem[]>();
  for (const row of rows) {
    const items = byType.get(row.type) ?? [];
    if (items.length >= input.limit) continue;
    items.push({ id: String(row.id), title: row.title });
    byType.set(row.type, items);
  }

  const groups: SearchGroup[] = [];
  let priority = PRIORITY_BASE;
  for (const [type, spec] of readable) {
    const items = byType.get(type);
    if (!items || items.length === 0) continue;
    groups.push({
      key: `entry:${type}`,
      label: spec.labels?.plural ?? spec.label,
      priority: priority++,
      items,
    });
  }
  return groups;
}

function titleExcerptCondition(term: SearchTerm): SQL {
  const pattern = `%${escapeLikePattern(term.value)}%`;
  const match = sql`(
    COALESCE(${entries.title}, '') LIKE ${pattern} ESCAPE '\\'
    OR COALESCE(${entries.excerpt}, '') LIKE ${pattern} ESCAPE '\\'
  )`;
  return term.exclude ? not(match) : match;
}
