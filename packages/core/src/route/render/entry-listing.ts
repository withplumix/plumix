import type { AppContext } from "../../context/app.js";
import type { EntryQuery } from "../../entries/query.js";
import type { PluginRegistry } from "../../plugin/manifest.js";
import type { Pagination, ResolvedEntry } from "./resolved-entry.js";
import { typeTag } from "../../cdn/tags.js";
import { sql } from "../../db/index.js";
import {
  compileEntryQuery,
  entryQuery,
  entryQueryOrder,
  entryQueryTypeNames,
} from "../../entries/query.js";
import { publicEntryRows } from "../../entries/visibility.js";
import { publicEntryTypeNames } from "../../plugin/registry.js";
import { buildResolvedEntries } from "./build-resolved-entries.js";
import { paginatedEntries } from "./page-data.js";

/**
 * The query every archive starts from: the public entries, and nothing a
 * receiver can add back. Where the site routes no public type at all it is
 * `none()` rather than unconstrained — an empty archive, not an open one.
 */
export function publicEntriesQuery(plugins: PluginRegistry): EntryQuery {
  const guard = publicEntryRows(plugins);
  return guard === null ? entryQuery().none() : entryQuery().where(guard);
}

/**
 * The CDN tags an archive's page is stored under: the types its query can
 * list, or every public type where it names none. A publish of any of them can
 * change the page, so a publish of any of them purges it — the same coarse
 * invalidation the built-in archives get.
 */
export function listingCdnTags(
  plugins: PluginRegistry,
  query: EntryQuery,
): readonly string[] {
  const types = entryQueryTypeNames(query) ?? publicEntryTypeNames(plugins);
  return types.map(typeTag);
}

/** One page of an archive's entries, resolved the way a theme reads them. */
export interface EntryListing {
  readonly entries: readonly ResolvedEntry[];
  readonly pagination: Pagination;
}

/** A listing, plus the one thing only the reader can say about the page asked for. */
export interface EntryPage extends EntryListing {
  /** The page is past the last one — a 404 at every surface that has pages. */
  readonly outOfRange: boolean;
}

/** Which page of the listing to read, and how big a page is. */
export interface EntryPageRequest {
  readonly page: number;
  readonly perPage: number;
}

/**
 * Run an entry query as one page of a listing: the resolved entries, their
 * pagination, and whether the page number ran off the end.
 *
 * `null` is a query that names something no row could answer to — a term path
 * nothing matches — which the caller reads as a 404 rather than as an empty
 * page. An empty page is `entries: []` with `outOfRange: false`, the answer an
 * archive with nothing in it yet gets.
 *
 * The public-entries rule is applied here whether or not the query already
 * carries it, for the reason ADR 0007 gives for applying a feed's guard twice:
 * a query built from scratch rather than narrowed from the one it was handed
 * still cannot list a draft.
 *
 * The built-in archives still assemble their own predicate and page through
 * `paginatedEntries` directly; ADR 0008 moves them onto an entry query and
 * through here (#2550), leaving this the one listing reader.
 */
export async function listEntryPage(
  ctx: AppContext,
  query: EntryQuery,
  { page, perPage }: EntryPageRequest,
): Promise<EntryPage | null> {
  const narrowed = await compileEntryQuery(ctx, query);
  if (narrowed === null) return null;

  // A null `where` is a site routing no public type at all: no entry can be
  // listed, and `paginatedEntries` answers it without a round-trip.
  const guard = publicEntryRows(ctx.plugins);
  const result = await paginatedEntries(
    ctx,
    guard === null ? null : sql`${guard} and ${narrowed}`,
    page,
    perPage,
    entryQueryOrder(query),
  );
  return {
    entries: result.outOfRange
      ? []
      : await buildResolvedEntries(ctx, result.rows),
    pagination: {
      page,
      perPage,
      total: result.total,
      pageCount: result.pageCount,
    },
    outOfRange: result.outOfRange,
  };
}
