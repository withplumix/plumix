import type { AppContext } from "plumix/plugin";
import { inArray, sql } from "plumix/db";
import {
  buildEntryPermalinks,
  buildTermArchiveUrls,
  resolveEntryList,
} from "plumix/plugin";
import { entries, terms } from "plumix/schema";

import type { SearchSourceType } from "../db/schema.js";
import type { RankingAlgorithm, RankingWeights } from "../ranking.js";
import type { MatchedRow } from "./query-row.js";
import { ensureSearchIndex, isMissingSearchIndex } from "../db/ddl.js";
import { DEFAULT_RANKING_ALGORITHM, rankingWeights } from "../ranking.js";
import { searchableEntryTypes, searchableTaxonomies } from "./document.js";
import { degradedRows } from "./query-degraded.js";
import { DEFAULT_COMMON_TERM_THRESHOLD, planForQuery } from "./query-plan.js";
import { searchableEntryRows } from "./query-scope.js";
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
   * Escaped HTML with `<mark>` highlights, safe as element content but not in
   * an attribute. Without an index it is the whole excerpt, unmarked.
   */
  readonly snippet: string;
  /**
   * bm25, smaller is better. `null` when the page was ordered by recency or
   * answered without an index.
   */
  readonly score: number | null;
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
  /** Document count above which a word is common enough to order by recency. */
  readonly commonTermThreshold?: number;
}

// Core's archive page size, so page boundaries match whichever route answered.
const DEFAULT_PER_PAGE = 20;

const EMPTY: SearchResults = {
  results: [],
  hasMore: false,
  outOfRange: false,
};

// SQLite rejects an `OFFSET` past its integer range, which would be a 500 on
// a URL any crawler can mint.
function isAskablePage(page: number): boolean {
  return Number.isSafeInteger(page) && page >= 1;
}

/**
 * Clamped to what an anonymous reader may see by joining `entries`, since
 * copying status into the projection would re-tokenize on every publish.
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
  // The write side only excludes as of each entry's last write; clamping here
  // makes opting a type out take effect at once.
  const types = searchableEntryTypes(ctx.plugins);
  const taxonomies = searchableTaxonomies(ctx.plugins);
  if (types.length === 0 && taxonomies.length === 0) return EMPTY;
  const weights = rankingWeights(options.ranking ?? DEFAULT_RANKING_ALGORITHM);
  const limit = perPage + 1;
  const offset = (page - 1) * perPage;
  const rows = await matchedRows(ctx, {
    query: options.query,
    match,
    types,
    taxonomies,
    weights,
    limit,
    offset,
    threshold: options.commonTermThreshold ?? DEFAULT_COMMON_TERM_THRESHOLD,
  });

  const results = await toResults(ctx, rows.slice(0, perPage));
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

interface ReadArgs {
  readonly match: string;
  readonly types: readonly string[];
  readonly taxonomies: readonly string[];
  readonly weights: RankingWeights;
  readonly limit: number;
  readonly offset: number;
}

interface PageArgs extends ReadArgs {
  /** The visitor's words, for the reader with no index. */
  readonly query: string;
  readonly threshold: number;
}

// Catches a missing index instead of checking first on every search. Repair is
// deferred after the degraded read so its rebuild does not queue ahead.
async function matchedRows(
  ctx: AppContext,
  args: PageArgs,
): Promise<MatchedRow[]> {
  const { match, types, limit, offset, threshold } = args;
  try {
    const plan = await planForQuery(ctx, {
      match,
      types,
      needed: offset + limit,
      threshold,
    });
    return await (plan === "ranked" ? rankedRows : recentRows)(ctx, args);
  } catch (error) {
    if (!isMissingSearchIndex(error)) throw error;
    // The page cannot tell anyone; without this an operator never learns the
    // index is missing.
    ctx.logger.warn(
      "search: no index to query, answering from title and excerpt",
      { query: args.query },
    );
    const rows = await degradedRows(ctx, args);
    ctx.defer(ensureSearchIndex(ctx.db));
    return rows;
  }
}

const SNIPPET = sql`
  snippet(
    search_index, -1,
    ${SNIPPET_MARKERS.open}, ${SNIPPET_MARKERS.close},
    ${SNIPPET_MARKERS.ellipsis}, ${SNIPPET_MARKERS.tokens}
  )
`;

async function rankedRows(
  ctx: AppContext,
  { match, types, taxonomies, weights, limit, offset }: ReadArgs,
): Promise<MatchedRow[]> {
  // One query for entries and terms, because bm25 is not comparable across
  // queries. Tiebreak on the document id: `source_id` is unique only per kind.
  const entryRows = searchableEntryRows(ctx, types) ?? sql`FALSE`;
  return await ctx.db.all<MatchedRow>(sql`
    SELECT documents.source_type AS kind,
           documents.source_id AS id,
           coalesce(entries.type, terms.taxonomy) AS scope,
           coalesce(entries.slug, terms.slug) AS slug,
           coalesce(entries.parent_id, terms.parent_id) AS parentId,
           coalesce(entries.title, terms.name) AS title,
           bm25(search_index, ${weights.title}, ${weights.body}) AS score,
           ${SNIPPET} AS snippet
      FROM search_index
      JOIN search_documents AS documents ON documents.id = search_index.rowid
      LEFT JOIN entries
        ON documents.source_type = 'entry' AND entries.id = documents.source_id
      LEFT JOIN terms
        ON documents.source_type = 'term' AND terms.id = documents.source_id
     WHERE search_index MATCH ${match}
       AND (
         (documents.source_type = 'entry' AND ${entryRows})
         OR (documents.source_type = 'term'
          AND ${inArray(terms.taxonomy, taxonomies)})
       )
     ORDER BY score, documents.id
     LIMIT ${limit} OFFSET ${offset}
  `);
}

// Driven off `entries` so the planner walks the published index and stops at
// the limit (1.1 ms vs 64 ms at 50 000). Entries only: terms have no date.
async function recentRows(
  ctx: AppContext,
  { match, types, limit, offset }: ReadArgs,
): Promise<MatchedRow[]> {
  const entryRows = searchableEntryRows(ctx, types);
  if (entryRows === null) return [];
  const page = await ctx.db.all<
    Omit<MatchedRow, "snippet" | "score"> & {
      readonly documentId: number;
    }
  >(sql`
    SELECT 'entry' AS kind,
           entries.id AS id,
           entries.type AS scope,
           entries.slug AS slug,
           entries.parent_id AS parentId,
           entries.title AS title,
           documents.id AS documentId
      FROM entries
      JOIN search_documents AS documents
        ON documents.source_type = 'entry' AND documents.source_id = entries.id
     WHERE ${entryRows}
       AND EXISTS (
         SELECT 1 FROM search_index
          WHERE search_index MATCH ${match} AND rowid = documents.id
       )
     ORDER BY entries.published_at DESC, entries.id DESC
     LIMIT ${limit} OFFSET ${offset}
  `);
  if (page.length === 0) return [];

  const snippets = await ctx.db.all<{
    documentId: number;
    snippet: string;
  }>(sql`
    SELECT rowid AS documentId, ${SNIPPET} AS snippet
      FROM search_index
     WHERE search_index MATCH ${match}
       AND rowid IN ${page.map((row) => row.documentId)}
  `);
  const byDocument = new Map(
    snippets.map((row) => [row.documentId, row.snippet]),
  );
  return page.map(({ documentId, ...row }) => ({
    ...row,
    // Null, not zero: a page ordered by date has no relevance to report.
    score: null,
    snippet: byDocument.get(documentId) ?? "",
  }));
}

// The index holds raw titles so an expanded `[year]` does not freeze into it.
async function resolvedEntryTitles(
  ctx: AppContext,
  ids: readonly number[],
): Promise<ReadonlyMap<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await ctx.db
    .select()
    .from(entries)
    .where(inArray(entries.id, [...ids]));
  const resolved = await resolveEntryList(ctx, rows);
  return new Map(resolved.map((entry) => [entry.id, entry.title]));
}

async function toResults(
  ctx: AppContext,
  rows: readonly MatchedRow[],
): Promise<(SearchResult | null)[]> {
  const entryRows: {
    index: number;
    id: number;
    type: string;
    slug: string;
    parentId: number | null;
  }[] = [];
  const termRows: {
    index: number;
    taxonomy: string;
    slug: string;
    parentId: number | null;
  }[] = [];
  rows.forEach((row, index) => {
    if (row.kind === "entry") {
      entryRows.push({
        index,
        id: row.id,
        type: row.scope,
        slug: row.slug,
        parentId: row.parentId,
      });
    } else {
      termRows.push({
        index,
        taxonomy: row.scope,
        slug: row.slug,
        parentId: row.parentId,
      });
    }
  });
  const [entryUrls, termUrls, entryTitles] = await Promise.all([
    buildEntryPermalinks(ctx, entryRows),
    buildTermArchiveUrls(ctx, termRows),
    resolvedEntryTitles(
      ctx,
      entryRows.map(({ id }) => id),
    ),
  ]);
  const urls = new Array<string | null>(rows.length).fill(null);
  entryRows.forEach(({ index }, i) => {
    urls[index] = entryUrls[i] ?? null;
  });
  termRows.forEach(({ index }, i) => {
    urls[index] = termUrls[i] ?? null;
  });
  return rows.map((row, i) => {
    const url = urls[i];
    if (url === null || url === undefined) return null;
    return {
      kind: row.kind,
      id: row.id,
      title:
        (row.kind === "entry" ? entryTitles.get(row.id) : undefined) ??
        row.title,
      url,
      snippet: highlightSnippet(row.snippet),
      score: row.score,
    };
  });
}
