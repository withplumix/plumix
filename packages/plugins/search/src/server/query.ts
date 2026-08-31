import type { AppContext } from "plumix/plugin";
import { buildEntryPermalink } from "plumix";
import { inArray, sql } from "plumix/db";
import { entries } from "plumix/schema";

import type { SearchSourceType } from "../db/schema.js";
import type { RankingAlgorithm } from "../ranking.js";
import { DEFAULT_RANKING_ALGORITHM, rankingWeights } from "../ranking.js";
import { searchableEntryTypes } from "./document.js";
import {
  highlightSnippet,
  SNIPPET_MARKERS,
  toMatchExpression,
} from "./query-text.js";

/** One thing the index matched, in the shape a theme renders. */
export interface SearchResult {
  /** What the result is, so a theme can render an entry and a term apart. */
  readonly kind: SearchSourceType;
  readonly id: number;
  readonly title: string;
  readonly url: string;
  /**
   * Escaped, with `<mark>` around what matched — safe as element content, the
   * context a snippet is rendered in. Not safe in an attribute: quotes pass
   * through, the same caveat core's own `escapeHtml` carries.
   */
  readonly snippet: string;
  /** bm25, ascending: a smaller number is a better match. */
  readonly score: number;
}

export interface SearchResults {
  readonly results: readonly SearchResult[];
  /** Whether a page follows this one. */
  readonly hasMore: boolean;
  /** True when the page is past the end of the results — a 404, not a page. */
  readonly outOfRange: boolean;
}

export interface SearchOptions {
  readonly query: string;
  /** 1-based. */
  readonly page: number;
  readonly perPage?: number;
  readonly ranking?: RankingAlgorithm;
}

// Core's own archive page size, which this page replaces. Matching it keeps a
// visitor's page boundaries the same whichever route answered.
const DEFAULT_PER_PAGE = 20;

const EMPTY: SearchResults = {
  results: [],
  hasMore: false,
  outOfRange: false,
};

/**
 * A page number the database can be asked for. `:page` is a `\d+` capture, so
 * the shape is guaranteed and the magnitude is not: SQLite rejects an `OFFSET`
 * past its integer range outright, which would be a 500 on a URL any crawler
 * can mint.
 */
function isAskablePage(page: number): boolean {
  return Number.isSafeInteger(page) && page >= 1;
}

interface MatchedRow {
  readonly id: number;
  readonly type: string;
  readonly slug: string;
  readonly parentId: number | null;
  readonly title: string;
  readonly score: number;
  readonly snippet: string;
}

/**
 * Answer a visitor's search, ranked, clamped to what an anonymous reader may
 * see, and one page at a time.
 *
 * The clamp is a join back to `entries` rather than a column on the
 * projection: an entry's status changes far more often than its text, and
 * copying it into the projection would mean re-tokenizing a document every
 * time something was published or trashed.
 *
 * One row over the page is read so the caller learns whether another page
 * exists without a second `COUNT(*)` over a match set FTS5 has already scored.
 */
export async function runSearch(
  ctx: AppContext,
  options: SearchOptions,
): Promise<SearchResults> {
  const match = toMatchExpression(options.query);
  if (match === null) return EMPTY;

  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const { page } = options;
  if (!isAskablePage(page)) return { ...EMPTY, outOfRange: page !== 1 };
  // The write side already keeps an unsearchable type out of the projection,
  // but only as of its last write: opting an existing type out would otherwise
  // leave every entry already indexed live in results until something touched
  // each one. Clamping here makes the exclusion take effect at once.
  const types = searchableEntryTypes(ctx.plugins);
  if (types.length === 0) return EMPTY;
  const weights = rankingWeights(options.ranking ?? DEFAULT_RANKING_ALGORITHM);

  const rows = await ctx.db.all<MatchedRow>(sql`
    SELECT documents.source_id AS id,
           entries.type AS type,
           entries.slug AS slug,
           entries.parent_id AS parentId,
           entries.title AS title,
           bm25(search_index, ${weights.title}, ${weights.body}) AS score,
           snippet(
             search_index, -1,
             ${SNIPPET_MARKERS.open}, ${SNIPPET_MARKERS.close},
             ${SNIPPET_MARKERS.ellipsis}, ${SNIPPET_MARKERS.tokens}
           ) AS snippet
      FROM search_index
      JOIN search_documents AS documents ON documents.id = search_index.rowid
      JOIN entries ON entries.id = documents.source_id
     WHERE search_index MATCH ${match}
       AND documents.source_type = 'entry'
       AND entries.status = 'published'
       AND entries.published_at IS NOT NULL
       AND ${inArray(entries.type, types)}
     ORDER BY score, documents.source_id
     LIMIT ${perPage + 1} OFFSET ${(page - 1) * perPage}
  `);

  const results = await Promise.all(
    rows.slice(0, perPage).map((row) => toResult(ctx, row)),
  );
  return {
    // An entry whose type stopped being public has no URL to send a visitor
    // to, so it is not a result — the next index write drops it for good.
    results: results.filter((result) => result !== null),
    hasMore: rows.length > perPage,
    // What the page held before the permalink filter, so a page emptied by
    // that filter is still a page rather than the end of the results.
    outOfRange: rows.length === 0 && page > 1,
  };
}

async function toResult(
  ctx: AppContext,
  row: MatchedRow,
): Promise<SearchResult | null> {
  // Short-circuits to pure substitution for a flat entry type, so a page of
  // results costs no extra query. A hierarchical type pays one ancestor walk
  // per nested result — the price of a result a visitor can actually click,
  // where core's own listings settle for a null URL.
  const url = await buildEntryPermalink(ctx, row);
  if (url === null) return null;
  return {
    kind: "entry",
    id: row.id,
    title: row.title,
    url,
    snippet: highlightSnippet(row.snippet),
    score: row.score,
  };
}
