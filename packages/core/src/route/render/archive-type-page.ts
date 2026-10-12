import type { AppContext } from "../../context/app-context.js";
import type {
  ArchiveEntries,
  RegisteredArchiveType,
  TitledListingArchiveResolution,
} from "../../plugin/manifest.js";
import type { EntryListing } from "../contract/entry-listing.js";
import type {
  ArchiveTypeData,
  ListingArchiveData,
} from "../contract/resolved-entry.js";
import type { ResolvedNode } from "./rule-resolver.js";
import { archiveEntries } from "../archive-entries.js";
import { isPageOutcome } from "../contract/page-outcome.js";
import { listEntryPage, listingCdnTags } from "./entry-listing.js";
import { DEFAULT_ARCHIVE_PER_PAGE } from "./page-data.js";

/**
 * A plugin archive's page, named by the params its route captured. A `page`
 * param asks for a later page of a listing archive; without one it is the
 * first.
 */
export interface ArchiveTypePageTarget {
  readonly name: string;
  readonly params: Readonly<Record<string, string>>;
}

/** One plugin archive page, resolved but not rendered. */
export interface ResolvedArchiveTypePage {
  readonly node: ResolvedNode;
  readonly data: ArchiveTypeData;
  readonly title: string;
  /**
   * What purges the page: core's tags for a listing archive, the resolver's
   * own `tags` for an unlisted one.
   */
  readonly tags: readonly string[];
}

/**
 * Null when no such page exists, whether `resolve` returned `null` or threw
 * `pageNotFound()`. A thrown redirect is null too: it names another page.
 */
export async function resolveArchiveTypePage(
  ctx: AppContext,
  target: ArchiveTypePageTarget,
): Promise<ResolvedArchiveTypePage | null> {
  const archive = ctx.plugins.archiveTypes.get(target.name);
  if (archive === undefined) return null;
  try {
    const page = await archiveTypePage(ctx, archive, { ...target.params });
    return "missing" in page ? null : page;
  } catch (error) {
    if (isPageOutcome(error)) return null;
    throw error;
  }
}

/** Why a URL has no page behind it, as the hint its 404 carries. */
export interface MissingArchiveTypePage {
  readonly missing: string;
}

/** A plugin archive's page, or why it has none. */
export async function archiveTypePage(
  ctx: AppContext,
  archive: RegisteredArchiveType,
  params: Record<string, string>,
): Promise<ResolvedArchiveTypePage | MissingArchiveTypePage> {
  if (archive.entries !== undefined) {
    return listingArchivePage(ctx, archive, params);
  }
  const result = await archive.resolve(ctx, params);
  if (result === null) return { missing: "public-custom-archive-not-found" };
  return {
    node: { kind: "archiveType", name: archive.name },
    data: result.data,
    title: result.title,
    tags: result.tags ?? [],
  };
}

type ListingArchiveType = Extract<
  RegisteredArchiveType,
  { entries: ArchiveEntries }
>;

async function listingArchivePage(
  ctx: AppContext,
  archive: ListingArchiveType,
  params: Record<string, string>,
): Promise<ResolvedArchiveTypePage | MissingArchiveTypePage> {
  const query = archiveEntries(
    ctx,
    { kind: "archiveType", name: archive.name },
    params,
  );
  if (query === null) return { missing: "public-custom-archive-no-entries" };

  const page = params.page === undefined ? 1 : Number(params.page);
  const listing = await listEntryPage(ctx, query, {
    page,
    perPage: archive.perPage ?? DEFAULT_ARCHIVE_PER_PAGE,
  });
  // Three distinct 404 hints, because each is a different bug: declined params,
  // an unresolved term or author, a page past the end.
  if (listing === null) {
    return { missing: "public-custom-archive-query-unresolved" };
  }
  if (listing.outOfRange) {
    return { missing: "public-custom-archive-page-out-of-range" };
  }

  const resolution = await nameListingPage(ctx, archive, params, listing);
  if (resolution === null)
    return { missing: "public-custom-archive-not-found" };

  // Core's half last: the archive's name and page are facts about the request,
  // not fields a resolver gets to restate differently.
  const data: ListingArchiveData = {
    ...resolution.data,
    kind: "archiveType",
    name: archive.name,
    page,
    entries: listing.entries,
    pagination: listing.pagination,
  };
  return {
    node: { kind: "archiveType", name: archive.name },
    data,
    title: resolution.title,
    tags: listingCdnTags(ctx.plugins, query),
  };
}

/**
 * Asked per arm so the types guarantee a title exists; the arm that declares a
 * `title` is the arm whose resolver cannot return one.
 */
async function nameListingPage(
  ctx: AppContext,
  archive: ListingArchiveType,
  params: Record<string, string>,
  listing: EntryListing,
): Promise<TitledListingArchiveResolution | null> {
  if (archive.title === undefined) return archive.resolve(ctx, params, listing);

  const title =
    typeof archive.title === "function" ? archive.title(params) : archive.title;
  const resolution =
    archive.resolve === undefined
      ? {}
      : await archive.resolve(ctx, params, listing);
  return resolution === null ? null : { ...resolution, title };
}
