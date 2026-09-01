import type { AppContext } from "plumix/plugin";
import { buildEntryPermalink, buildTermArchiveUrl } from "plumix";
import { inArray, sql } from "plumix/db";
import { entries, terms } from "plumix/schema";

import type { SearchSourceType } from "../db/schema.js";
import type { RankingAlgorithm, RankingWeights } from "../ranking.js";
import type { MatchedRow } from "./query-row.js";
import { ensureSearchIndex, isMissingSearchIndex } from "../db/ddl.js";
import { DEFAULT_RANKING_ALGORITHM, rankingWeights } from "../ranking.js";
import { searchableEntryTypes, searchableTaxonomies } from "./document.js";
import { degradedRows } from "./query-degraded.js";
import { DEFAULT_COMMON_TERM_THRESHOLD, planForQuery } from "./query-plan.js";
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
   *
   * Two dozen tokens of the text around the match, except on a page answered
   * without an index: that one carries the entry's whole excerpt, unmarked and
   * uncapped, because `LIKE` reports that a row matched and not where.
   */
  readonly snippet: string;
  /**
   * bm25, ascending: a smaller number is a better match. Null when the page
   * was ordered by recency, because a word in nearly every document has no
   * meaningful bm25 to report — and null on a page answered without an index,
   * which has no relevance to report at all.
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

interface ReadArgs {
  readonly match: string;
  readonly types: readonly string[];
  readonly taxonomies: readonly string[];
  readonly weights: RankingWeights;
  readonly limit: number;
  readonly offset: number;
}

/** What the stage around the readers needs on top of what they read with. */
interface PageArgs extends ReadArgs {
  /** What the visitor typed, for the reader that has no index to ask. */
  readonly query: string;
  readonly threshold: number;
}

/**
 * A page of matches, from the index when there is one and from title and
 * excerpt when there is not.
 *
 * A missing index is a real state — a raw migration that never ran, a restored
 * dump, a fresh install before the first drain — and it is not a state a
 * visitor should meet as an error page. So it is recognised rather than
 * guarded against: asking `sqlite_master` first would put a query on every
 * search to answer a question that is almost always the same, where letting
 * the read fail costs nothing until the day it does.
 *
 * The repair is handed to `defer` after the degraded read, not before it. A
 * deferred promise starts running where it is created, and a repair ends in a
 * rebuild that is O(corpus) — created first, it would queue that work on the
 * connection ahead of the visitor's own query.
 */
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
    // Said out loud, because the page itself cannot say it: a visitor sees
    // thinner results and an operator would otherwise have no way to learn
    // that the site has been searching without an index since a migration
    // they never applied.
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

/**
 * Relevance order, driven off the index. FTS5 scores every match before the
 * limit applies, which is what makes this the wrong plan for a word almost
 * every document holds and the right one for everything else.
 */
async function rankedRows(
  ctx: AppContext,
  { match, types, taxonomies, weights, limit, offset }: ReadArgs,
): Promise<MatchedRow[]> {
  // Entries and terms are read together rather than queried apart, because
  // bm25 is not comparable across queries: merging two ranked lists would put
  // numbers side by side that were computed against different corpora, and it
  // forces offset pagination on the merge. Both subjects resolve by primary
  // key, so a page costs two lookups per row.
  //
  // The tiebreak is the document's own id: `source_id` stopped being unique
  // the moment two kinds shared the table.
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
         (documents.source_type = 'entry'
          AND entries.status = 'published'
          AND entries.published_at IS NOT NULL
          AND ${inArray(entries.type, types)})
         OR (documents.source_type = 'term'
          AND ${inArray(terms.taxonomy, taxonomies)})
       )
     ORDER BY score, documents.id
     LIMIT ${limit} OFFSET ${offset}
  `);
}

/**
 * Recency order, driven off `entries` instead.
 *
 * Ordering the index's own output by `published_at` does not work: matching
 * makes FTS5 the outer loop, so the sort cannot reach the entries index and
 * every match goes through a temp b-tree. Asking `entries` for its newest
 * rows and testing each against the index inverts that — the planner walks
 * `entries_type_status_published_idx` and stops at the limit. Measured at
 * 50 000 entries, a word in every document: 64 ms the first way, 1.1 ms this
 * way.
 *
 * The cost is a second statement. `snippet()` needs the index row, which the
 * subquery above has no way to hand back, so the snippets are fetched for the
 * page that survived — bounded to it, and constrained by rowid, which FTS5
 * answers without scanning the match set again.
 *
 * Entries only. A term has no publication date to be ordered by, and this
 * plan is a walk down that date order — so a word common enough to reach it
 * is answered with articles. The ranked plan, which is what a topic name
 * takes, spans both.
 */
async function recentRows(
  ctx: AppContext,
  { match, types, limit, offset }: ReadArgs,
): Promise<MatchedRow[]> {
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
     WHERE entries.status = 'published'
       AND entries.published_at IS NOT NULL
       AND ${inArray(entries.type, types)}
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

async function toResult(
  ctx: AppContext,
  row: MatchedRow,
): Promise<SearchResult | null> {
  // Both short-circuit to pure substitution for a flat type, so a page of
  // results costs no extra query. A hierarchical one pays an ancestor walk per
  // nested result — the price of a result a visitor can actually click, where
  // core's own listings settle for a null URL.
  const { slug, parentId } = row;
  const url =
    row.kind === "entry"
      ? await buildEntryPermalink(ctx, { type: row.scope, slug, parentId })
      : await buildTermArchiveUrl(ctx, { taxonomy: row.scope, slug, parentId });
  if (url === null) return null;
  return {
    kind: row.kind,
    id: row.id,
    title: row.title,
    url,
    snippet: highlightSnippet(row.snippet),
    score: row.score,
  };
}
