import type { AppContext } from "plumix/plugin";
import {
  and,
  desc,
  entrySearchCondition,
  tokenizeSearchQuery,
} from "plumix/db";
import { entries } from "plumix/schema";

import type { MatchedRow } from "./query-row.js";
import { searchableEntryRows } from "./query-scope.js";

interface DegradedArgs {
  /** The visitor's words, not a match expression. */
  readonly query: string;
  readonly types: readonly string[];
  readonly limit: number;
  readonly offset: number;
}

/**
 * Words are ANDed, unlike core's whole-query substring, so a two-word query
 * still finds something. Returns no terms, and newest first since `LIKE` has
 * no relevance.
 */
export async function degradedRows(
  ctx: AppContext,
  { query, types, limit, offset }: DegradedArgs,
): Promise<MatchedRow[]> {
  const terms = tokenizeSearchQuery(query);
  if (terms.length === 0) return [];
  const entryRows = searchableEntryRows(ctx, types);
  if (entryRows === null) return [];

  const rows = await ctx.db
    .select({
      id: entries.id,
      scope: entries.type,
      slug: entries.slug,
      parentId: entries.parentId,
      title: entries.title,
      excerpt: entries.excerpt,
    })
    .from(entries)
    .where(and(entryRows, ...terms.map(entrySearchCondition)))
    .orderBy(desc(entries.publishedAt), desc(entries.id))
    .limit(limit)
    .offset(offset);

  return rows.map(({ excerpt, ...row }) => ({
    ...row,
    kind: "entry" as const,
    score: null,
    // Unhighlighted: `LIKE` reports that a row matched, not where.
    snippet: excerpt ?? "",
  }));
}
