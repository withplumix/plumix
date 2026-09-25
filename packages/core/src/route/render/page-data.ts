import type { SQL } from "drizzle-orm";
import { count } from "drizzle-orm";

import type { AppContext } from "../../context/app.js";
import type { Entry } from "../../db/schema/entries.js";
import type { Term } from "../../db/schema/terms.js";
import type { EntryQuery } from "../../entries/query.js";
import type { EntryListing } from "./entry-listing.js";
import type {
  ArchiveData,
  AuthorArchiveData,
  DateArchiveData,
  FrontPageData,
  ResolvedAuthor,
  TaxonomyData,
} from "./resolved-entry.js";
import type { ResolvedNode } from "./rule-resolver.js";
import { desc, eq } from "../../db/index.js";
import { entries } from "../../db/schema/entries.js";
import { terms } from "../../db/schema/terms.js";
import { users } from "../../db/schema/users.js";
import { labelSourceText } from "../../i18n/label.js";
import { resolveTermMeta } from "../../rpc/procedures/term/meta.js";
import { archiveEntries } from "../archive-entries.js";
import { archiveSlugForEntryType } from "../compile.js";
import { paginate } from "../paginate.js";
import { rememberAuthor, rememberTermSegments } from "../path-chain.js";
import { buildTermArchiveUrl } from "../permalink.js";
import { resolveAuthorRow, resolveTerm } from "./build-resolved-entries.js";
import { listEntryPage } from "./entry-listing.js";

declare module "../../hooks/types.js" {
  interface FilterRegistry {
    "resolve:archive:data": (
      data: ArchiveData,
    ) => ArchiveData | Promise<ArchiveData>;
    "resolve:term:data": (
      data: TaxonomyData,
    ) => TaxonomyData | Promise<TaxonomyData>;
    "resolve:author:data": (
      data: AuthorArchiveData,
    ) => AuthorArchiveData | Promise<AuthorArchiveData>;
    "resolve:date:data": (
      data: DateArchiveData,
    ) => DateArchiveData | Promise<DateArchiveData>;
    "resolve:front-page:data": (
      data: FrontPageData,
    ) => FrontPageData | Promise<FrontPageData>;
  }
}

export const DEFAULT_ARCHIVE_PER_PAGE = 20;

/** Every page kind that lists entries: the payload half of what core renders. */
type ListingPageData =
  | FrontPageData
  | ArchiveData
  | TaxonomyData
  | AuthorArchiveData
  | DateArchiveData;

/**
 * One listing page, resolved but not rendered: the node a rule matches on, the
 * data a template receives, and the document title core gives it.
 */
export interface ResolvedListingPage {
  readonly node: ResolvedNode;
  readonly data: ListingPageData;
  readonly title: string;
}

export async function frontPageData(
  ctx: AppContext,
  params: Record<string, string>,
  page: number,
): Promise<ResolvedListingPage | null> {
  const listing = await listingFor(
    ctx,
    archiveEntries(ctx, { kind: "front-page" }, params),
    page,
    DEFAULT_ARCHIVE_PER_PAGE,
  );
  if (listing === null) return null;

  const data = await ctx.hooks.applyFilter("resolve:front-page:data", {
    kind: "frontPage",
    ...listing,
  });
  return {
    node: { kind: "front-page" },
    data,
    // Public-route content i18n is a deferred userland seam; "Home"
    // (site root) stays English here.
    title: "Home",
  };
}

export async function archiveData(
  ctx: AppContext,
  entryType: string,
  params: Record<string, string>,
  page: number,
): Promise<ResolvedListingPage | null> {
  const registered = ctx.plugins.entryTypes.get(entryType);
  const listing = await listingFor(
    ctx,
    archiveEntries(ctx, { kind: "archive", entryType }, params),
    page,
    registered?.archivePerPage ?? DEFAULT_ARCHIVE_PER_PAGE,
  );
  if (listing === null) return null;

  const data = await ctx.hooks.applyFilter("resolve:archive:data", {
    kind: "archive",
    contentType: entryType,
    ...listing,
  });
  return {
    node: { kind: "content-type-archive", entryType },
    data,
    // SSR-side: descriptor labels fall back to source text until the
    // ctx.i18n route wiring lands (slice 11 #680 covered tRPC errors;
    // route titles pending).
    title: registered
      ? labelSourceText(registered.labels?.plural ?? registered.label)
      : entryType,
  };
}

/**
 * `params` carries the term's segments as its URL spells them, the ones its
 * page was resolved from, so compiling the listing's `inTerm` replays that
 * lookup.
 */
export async function termData(
  ctx: AppContext,
  term: Term,
  params: Record<string, string>,
  page: number,
): Promise<ResolvedListingPage | null> {
  const taxonomy = ctx.plugins.termTaxonomies.get(term.taxonomy);
  const listing = await listingFor(
    ctx,
    archiveEntries(ctx, { kind: "taxonomy", taxonomy: term.taxonomy }, params),
    page,
    taxonomy?.archivePerPage ?? DEFAULT_ARCHIVE_PER_PAGE,
  );
  if (listing === null) return null;

  // Independent reads — the ancestor walk does not depend on the meta bag.
  const [meta, url] = await Promise.all([
    resolveTermMeta(ctx, term.taxonomy, term.meta),
    // Single archive term: the async builder walks ancestors for the full
    // nested URL (one call — no N+1).
    buildTermArchiveUrl(ctx, term),
  ]);
  const data = await ctx.hooks.applyFilter("resolve:term:data", {
    kind: "taxonomy",
    taxonomy: term.taxonomy,
    term: resolveTerm(ctx, term, meta, url),
    ...listing,
  });
  return {
    node: {
      kind: "term",
      taxonomy: term.taxonomy,
      slug: term.slug,
      databaseId: term.id,
    },
    data,
    title: taxonomy
      ? labelSourceText(taxonomy.labels?.singular ?? taxonomy.label)
      : term.name,
  };
}

export async function authorData(
  ctx: AppContext,
  author: ResolvedAuthor,
  params: Record<string, string>,
  page: number,
): Promise<ResolvedListingPage | null> {
  const listing = await listingFor(
    ctx,
    archiveEntries(ctx, { kind: "author" }, params),
    page,
    DEFAULT_ARCHIVE_PER_PAGE,
  );
  if (listing === null) return null;

  const data = await ctx.hooks.applyFilter("resolve:author:data", {
    kind: "author",
    author,
    ...listing,
  });
  return {
    node: { kind: "author", slug: author.slug, databaseId: author.id },
    data,
    title: data.author.name ?? data.author.slug,
  };
}

export interface DateTarget {
  readonly year: number;
  /** 1-based, and null at a coarser granularity. */
  readonly month: number | null;
  readonly day: number | null;
}

export async function dateData(
  ctx: AppContext,
  target: DateTarget,
  params: Record<string, string>,
  page: number,
): Promise<ResolvedListingPage | null> {
  const { year, month, day } = target;
  const listing = await listingFor(
    ctx,
    archiveEntries(ctx, { kind: "date" }, params),
    page,
    DEFAULT_ARCHIVE_PER_PAGE,
  );
  if (listing === null) return null;

  const data = await ctx.hooks.applyFilter("resolve:date:data", {
    kind: "date",
    year,
    month,
    day,
    ...listing,
  });
  return {
    node: { kind: "date", year, month, day },
    data,
    title: dateTitle(year, month, day),
  };
}

/**
 * A listing page named by what it is about rather than by the URL it sits at:
 * the front page, a content-type archive, a term, an author, or a date.
 *
 * Only the pages core itself routes — a `registerArchiveType` archive resolves
 * through the plugin that registered it, from route parameters this vocabulary
 * has no way to name. Search is absent for the same reason a card is never
 * minted for one: its subject is whatever the caller typed.
 */
export type ListingPageTarget =
  | { readonly kind: "front-page" }
  | { readonly kind: "archive"; readonly entryType: string }
  | { readonly kind: "term"; readonly id: number }
  | { readonly kind: "author"; readonly id: number }
  | ({ readonly kind: "date" } & DateTarget);

/**
 * Resolve a listing page from its identity — what a plugin holds when it is
 * addressing a page it did not route to, such as a social card served at a URL
 * of its own. Null when no such public page exists.
 *
 * Always the first page: a caller naming a page kind is naming the archive, not
 * one paginated slice of it, and `pagination.page` is the only field that would
 * differ between the two.
 */
export async function resolveListingPage(
  ctx: AppContext,
  target: ListingPageTarget,
): Promise<ResolvedListingPage | null> {
  switch (target.kind) {
    case "front-page":
      return frontPageData(ctx, {}, 1);
    case "archive": {
      const registered = ctx.plugins.entryTypes.get(target.entryType);
      // Asked of the router's own helper rather than restated, so a type whose
      // archive is not routed is answered as the missing page it is.
      if (!registered?.isPublic) return null;
      if (archiveSlugForEntryType(registered) === null) return null;
      return archiveData(ctx, target.entryType, {}, 1);
    }
    case "term": {
      const term = await ctx.db.query.terms.findFirst({
        where: eq(terms.id, target.id),
      });
      if (!term) return null;
      const taxonomy = ctx.plugins.termTaxonomies.get(term.taxonomy);
      if (!taxonomy?.isPublic) return null;
      const path = await rememberTermSegments(ctx, term);
      return termData(ctx, term, { path: path.join("/") }, 1);
    }
    case "author": {
      const author = await ctx.db.query.users.findFirst({
        where: eq(users.id, target.id),
      });
      if (!author) return null;
      await rememberAuthor(ctx, author);
      return authorData(
        ctx,
        await resolveAuthorRow(ctx, author),
        { slug: author.slug },
        1,
      );
    }
    case "date":
      return dateData(ctx, target, dateParams(target), 1);
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

// The params a date archive's URL captures for this period.
function dateParams({ year, month, day }: DateTarget): Record<string, string> {
  return {
    year: String(year),
    ...(month === null ? {} : { month: pad2(month) }),
    ...(day === null ? {} : { day: pad2(day) }),
  };
}

function dateTitle(
  year: number,
  month: number | null,
  day: number | null,
): string {
  if (month === null) return String(year);
  if (day === null) return `${String(year)}-${pad2(month)}`;
  return `${String(year)}-${pad2(month)}-${pad2(day)}`;
}

// The `entries` + `pagination` half every listing payload shares. Null is a
// page no archive answers — past the last page, a date that does not exist,
// or params that place no archive — which each caller answers with its own
// 404 reason.
async function listingFor(
  ctx: AppContext,
  query: EntryQuery | null,
  page: number,
  perPage: number,
): Promise<EntryListing | null> {
  if (query === null) return null;
  const listed = await listEntryPage(ctx, query, { page, perPage });
  if (listed === null || listed.outOfRange) return null;
  return { entries: listed.entries, pagination: listed.pagination };
}

/**
 * The paginated-entries query under the listing reader and the search page.
 * Returns `{ outOfRange: true }` so the caller can pick the 404 reason.
 * `where === null` short-circuits to an empty result with no DB round-trip —
 * a site routing no public type at all, or a search with nothing to match.
 *
 * `order` defaults to newest first, which is what search is read in; an entry
 * query passes the order it carries.
 */
export async function paginatedEntries(
  ctx: AppContext,
  where: SQL | null | undefined,
  page: number,
  perPage: number,
  order: readonly SQL[] = [desc(entries.publishedAt), desc(entries.id)],
): Promise<{
  readonly rows: readonly Entry[];
  readonly outOfRange: boolean;
  readonly total: number;
  readonly pageCount: number;
}> {
  if (where == null) {
    const slice = paginate({ page, perPage, total: 0 });
    return {
      rows: [],
      outOfRange: slice.outOfRange,
      total: 0,
      pageCount: slice.totalPages,
    };
  }

  const totalRow = await ctx.db
    .select({ total: count() })
    .from(entries)
    .where(where);
  const total = totalRow[0]?.total ?? 0;

  const slice = paginate({ page, perPage, total });
  if (slice.outOfRange) {
    return {
      rows: [],
      outOfRange: true,
      total,
      pageCount: slice.totalPages,
    };
  }

  const rows = await ctx.db
    .select()
    .from(entries)
    .where(where)
    .orderBy(...order)
    .limit(slice.limit)
    .offset(slice.offset);
  return { rows, outOfRange: false, total, pageCount: slice.totalPages };
}
