import type { AppContext } from "plumix/plugin";
import {
  and,
  desc,
  entrySearchCondition,
  eq,
  inArray,
  isNotNull,
  tokenizeSearchQuery,
} from "plumix/db";
import { entries } from "plumix/schema";

import type { MatchedRow } from "./query-row.js";

interface DegradedArgs {
  /** What the visitor typed — the words, not a match expression. */
  readonly query: string;
  readonly types: readonly string[];
  readonly limit: number;
  readonly offset: number;
}

/**
 * A page of entries whose title or excerpt holds what the visitor typed —
 * the answer when there is no index to ask.
 *
 * Core's own vocabulary throughout: its tokenizer splits the query, and its
 * `entrySearchCondition` says what matching one term against title and excerpt
 * means. Imported rather than restated, because two spellings of that would
 * drift, and a degraded page is the wrong place to invent a third set of
 * search semantics.
 *
 * The terms are ANDed, and that is the part worth arguing. Core's public route
 * matches the whole query as one substring, so "winter hydroponics" finds only
 * an entry carrying those two words in that order — where the index, and
 * core's own admin search, take each word in turn. A visitor typing two words
 * is the ordinary case, and a degraded page that answers it with nothing is
 * not much of a fallback.
 *
 * Terms have no equivalent to fall back to. Core's search page has never
 * returned them, so a topic is simply missing until the index is back, rather
 * than being answered by a query that never existed.
 *
 * Newest first, because a `LIKE` scan has no relevance to report — the same
 * reason a row from here carries a null score.
 */
export async function degradedRows(
  ctx: AppContext,
  { query, types, limit, offset }: DegradedArgs,
): Promise<MatchedRow[]> {
  const terms = tokenizeSearchQuery(query);
  if (terms.length === 0) return [];

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
    .where(
      and(
        eq(entries.status, "published"),
        isNotNull(entries.publishedAt),
        inArray(entries.type, types),
        ...terms.map(entrySearchCondition),
      ),
    )
    .orderBy(desc(entries.publishedAt), desc(entries.id))
    .limit(limit)
    .offset(offset);

  return rows.map(({ excerpt, ...row }) => ({
    ...row,
    kind: "entry" as const,
    score: null,
    // Whatever the entry says about itself. Nothing is highlighted, because
    // nothing here knows where the match fell — `LIKE` reports that a row
    // matched, not where.
    snippet: excerpt ?? "",
  }));
}
