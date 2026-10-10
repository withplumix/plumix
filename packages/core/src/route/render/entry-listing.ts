import type { AppContext } from "../../context/app-context.js";
import type { EntryQuery } from "../../entries/contract/query.js";
import type { PluginRegistry } from "../../plugin/manifest.js";
import type { EntryListing } from "../contract/entry-listing.js";
import { typeTag } from "../../cdn/contract/tags.js";
import { sql } from "../../db/index.js";
import {
  compileEntryQuery,
  entryQuery,
  entryQueryOrder,
  entryQueryTypeNames,
} from "../../entries/query.js";
import { publicEntryRows } from "../../entries/visibility.js";
import { publicEntryTypeNames } from "../../plugin/registry.js";
import { paginatedEntries } from "./page-data.js";
import { resolveEntryList } from "./resolve-entry-list.js";

/**
 * With no public type routed, this is `none()`: an empty archive, not an open
 * one.
 */
export function publicEntriesQuery(plugins: PluginRegistry): EntryQuery {
  const guard = publicEntryRows(plugins);
  return guard === null ? entryQuery().none() : entryQuery().where(guard);
}

/** The types the query can list, or every public type when it names none. */
export function listingCdnTags(
  plugins: PluginRegistry,
  query: EntryQuery,
): readonly string[] {
  const types = entryQueryTypeNames(query) ?? publicEntryTypeNames(plugins);
  return types.map(typeTag);
}

/**
 * A listing, plus the one thing only the reader can say about the page asked
 * for.
 */
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
 * `null` means the query names something no row can match (a 404), unlike an
 * empty page. Re-applies the public-entries rule so a query built from scratch
 * still can't list a draft.
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
    entries: result.outOfRange ? [] : await resolveEntryList(ctx, result.rows),
    pagination: {
      page,
      perPage,
      total: result.total,
      pageCount: result.pageCount,
    },
    outOfRange: result.outOfRange,
  };
}
