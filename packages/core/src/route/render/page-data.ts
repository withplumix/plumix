import type { SQL } from "drizzle-orm";
import { count } from "drizzle-orm";

import type { AppContext } from "../../context/app.js";
import type { Entry } from "../../db/schema/entries.js";
import type { Term } from "../../db/schema/terms.js";
import type {
  ArchiveData,
  AuthorArchiveData,
  DateArchiveData,
  FrontPageData,
  Pagination,
  ResolvedAuthor,
  ResolvedEntry,
  TaxonomyData,
} from "./resolved-entry.js";
import type { ResolvedNode } from "./rule-resolver.js";
import { and, desc, eq, gte, inArray, isNotNull, lt } from "../../db/index.js";
import { entries } from "../../db/schema/entries.js";
import { entryTerm } from "../../db/schema/entry_term.js";
import { terms } from "../../db/schema/terms.js";
import { users } from "../../db/schema/users.js";
import { labelSourceText } from "../../i18n/label.js";
import { resolveTermMeta } from "../../rpc/procedures/term/meta.js";
import { archiveSlugForEntryType } from "../compile.js";
import { dateRange } from "../date-range.js";
import { paginate } from "../paginate.js";
import { buildTermArchiveUrl } from "../permalink.js";
import { buildResolvedEntries } from "./build-resolved-entries.js";

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

/**
 * The public, non-hierarchical entry types — a site's posts, not its standalone
 * pages. The front page, author archives, and date archives all list this set.
 */
function publicListingTypes(ctx: AppContext): string[] {
  return Array.from(ctx.plugins.entryTypes.entries())
    .filter(
      ([, spec]) => spec.isPublic !== false && spec.isHierarchical !== true,
    )
    .map(([key]) => key);
}

/**
 * What every listing page lists: published entries of the types the page is
 * about, plus whatever else that page narrows on. Null where the site has no
 * such type at all, which `paginatedEntries` answers with no round-trip.
 */
function listingWhere(
  types: readonly string[],
  ...narrowed: readonly SQL[]
): SQL | null | undefined {
  if (types.length === 0) return null;
  return and(
    eq(entries.status, "published"),
    isNotNull(entries.publishedAt),
    inArray(entries.type, types),
    ...narrowed,
  );
}

export async function frontPageData(
  ctx: AppContext,
  page: number,
): Promise<ResolvedListingPage | null> {
  // The latest-posts front feed excludes hierarchical types (pages) — they
  // are standalone content, not blog entries. (A configurable front-page /
  // posts-page model is the larger follow-up.)
  const where = listingWhere(publicListingTypes(ctx));
  const listing = await listingFor(ctx, where, page, DEFAULT_ARCHIVE_PER_PAGE);
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
  page: number,
): Promise<ResolvedListingPage | null> {
  const registered = ctx.plugins.entryTypes.get(entryType);
  const listing = await listingFor(
    ctx,
    listingWhere([entryType]),
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

export async function termData(
  ctx: AppContext,
  term: Term,
  page: number,
): Promise<ResolvedListingPage | null> {
  const taxonomy = ctx.plugins.termTaxonomies.get(term.taxonomy);
  // No attached entry types short-circuits — a taxonomy registered without any
  // yields an empty archive.
  const where = listingWhere(
    taxonomy?.entryTypes ?? [],
    inArray(
      entries.id,
      ctx.db
        .select({ id: entryTerm.entryId })
        .from(entryTerm)
        .where(eq(entryTerm.termId, term.id)),
    ),
  );
  const listing = await listingFor(
    ctx,
    where,
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
    term: { ...term, meta, storedMeta: term.meta, url },
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
  page: number,
): Promise<ResolvedListingPage | null> {
  // Author archives list the same type set as the front page — a person's
  // posts, not their standalone pages.
  const where = listingWhere(
    publicListingTypes(ctx),
    eq(entries.authorId, author.id),
  );
  const listing = await listingFor(ctx, where, page, DEFAULT_ARCHIVE_PER_PAGE);
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
  page: number,
): Promise<ResolvedListingPage | null> {
  const { year, month, day } = target;
  const range = dateRange(year, month, day);
  if (range === null) return null;

  // The same type set as the front page, in a published-at window.
  const where = listingWhere(
    publicListingTypes(ctx),
    gte(entries.publishedAt, range.start),
    lt(entries.publishedAt, range.end),
  );
  const listing = await listingFor(ctx, where, page, DEFAULT_ARCHIVE_PER_PAGE);
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
      return frontPageData(ctx, 1);
    case "archive": {
      const registered = ctx.plugins.entryTypes.get(target.entryType);
      // Asked of the router's own helper rather than restated, so a type whose
      // archive is not routed is answered as the missing page it is.
      if (registered === undefined || registered.isPublic === false)
        return null;
      if (archiveSlugForEntryType(registered) === null) return null;
      return archiveData(ctx, target.entryType, 1);
    }
    case "term": {
      const term = await ctx.db.query.terms.findFirst({
        where: eq(terms.id, target.id),
      });
      if (!term) return null;
      const taxonomy = ctx.plugins.termTaxonomies.get(term.taxonomy);
      if (!taxonomy || taxonomy.isPublic === false) return null;
      return termData(ctx, term, 1);
    }
    case "author": {
      const author = await ctx.db.query.users.findFirst({
        where: eq(users.id, target.id),
      });
      if (!author) return null;
      // Explicit projection — never spread the full user row (it carries email
      // and auth columns) into the public template payload.
      return authorData(
        ctx,
        {
          id: author.id,
          slug: author.slug,
          name: author.name,
          avatarUrl: author.avatarUrl,
        },
        1,
      );
    }
    case "date":
      return dateData(ctx, target, 1);
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
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

interface ResolvedListing {
  readonly entries: readonly ResolvedEntry[];
  readonly pagination: Pagination;
}

// The `entries` + `pagination` half every listing payload shares. Null is the
// out-of-range page each caller answers with its own 404 reason.
async function listingFor(
  ctx: AppContext,
  where: SQL | null | undefined,
  page: number,
  perPage: number,
): Promise<ResolvedListing | null> {
  const result = await paginatedEntries(ctx, where, page, perPage);
  if (result.outOfRange) return null;
  return {
    entries: await buildResolvedEntries(ctx, result.rows),
    pagination: {
      page,
      perPage,
      total: result.total,
      pageCount: result.pageCount,
    },
  };
}

/**
 * Shared paginated-entries query used by every listing resolver. Returns
 * `{ outOfRange: true }` so the caller can pick the 404 reason. `where === null`
 * short-circuits to an empty result with no DB round-trip — used by the
 * taxonomy resolver when a taxonomy is registered without any attached entry
 * types.
 */
export async function paginatedEntries(
  ctx: AppContext,
  where: SQL | null | undefined,
  page: number,
  perPage: number,
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
    .orderBy(desc(entries.publishedAt), desc(entries.id))
    .limit(slice.limit)
    .offset(slice.offset);
  return { rows, outOfRange: false, total, pageCount: slice.totalPages };
}
