import type { AppContext } from "../context/app-context.js";
import type { Entry } from "../db/schema/entries.js";
import type {
  ArchiveEntries,
  RegisteredArchiveType,
  TitledListingArchiveResolution,
} from "../plugin/manifest.js";
import type { EntryListing } from "./contract/entry-listing.js";
import type { RouteIntent } from "./contract/intent.js";
import type {
  ListingArchiveData,
  SearchData,
} from "./contract/resolved-entry.js";
import type { RouteMatch } from "./match.js";
import type { ResolvedListingPage } from "./render/page-data.js";
import type { RenderEnv } from "./render/render-env.js";
import { verifyPreviewGrant } from "../auth/preview-token.js";
import { withBasePath } from "../base-path.js";
import { accumulateEmbeddedTags } from "../cdn/embedded-tags.js";
import { and, eq, inArray, isNotNull } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { canEditEntry } from "../entries/editability.js";
import { getAutosave, overlayAutosave } from "../revisions/repository.js";
import { notFound, permanentRedirect } from "../runtime/http.js";
import { entrySearchCondition } from "../search/conditions.js";
import { archiveEntries, termSlugParam } from "./archive-entries.js";
import { resolveEditMode } from "./edit-mode.js";
import { findAuthorBySlug, findTermBySlug } from "./path-chain.js";
import { buildTermArchiveUrl } from "./permalink.js";
import { previewTokenGrantsEntry, readPreviewToken } from "./preview.js";
import { listEntryPage, listingCdnTags } from "./render/entry-listing.js";
import {
  archiveData,
  authorData,
  dateData,
  DEFAULT_ARCHIVE_PER_PAGE,
  frontPageData,
  paginatedEntries,
  resolveEntryData,
  termData,
} from "./render/page-data.js";
import { renderThroughTheme } from "./render/render-template.js";
import {
  resolveAuthorRow,
  resolveEntryList,
} from "./render/resolve-entry-list.js";
import { resolveSingleEntry } from "./single-entry.js";

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "resolve:search:data": (
      data: SearchData,
    ) => SearchData | Promise<SearchData>;
  }
}

// `renderThroughTheme` returns `null` when the theme has no rule for the node
// and no `fallback` — a 404, per the router-style resolution model.
function htmlResponseOrNotFound(html: string | null, reason: string): Response {
  if (html === null) return notFound(reason);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** Every listing page renders the same way once its data is resolved. */
async function renderListing(
  ctx: AppContext,
  renderEnv: RenderEnv,
  page: ResolvedListingPage,
  reason: string,
): Promise<Response> {
  const html = await renderThroughTheme({ ctx, renderEnv, ...page });
  return htmlResponseOrNotFound(html, reason);
}

export async function resolvePublicRoute(
  ctx: AppContext,
  match: RouteMatch,
  renderEnv: RenderEnv,
): Promise<Response> {
  ctx.resolvedRoute = {
    pattern: match.pattern,
    params: match.params,
    intent: match.intent,
  };
  switch (match.intent.kind) {
    case "single":
      return resolveSingle(ctx, match.intent, match.params, renderEnv);
    case "archive":
      return resolveArchive(ctx, match.intent, match.params, renderEnv);
    case "taxonomy":
      return resolveTaxonomy(ctx, match, match.intent, renderEnv);
    case "front-page":
      return resolveFrontPage(ctx, match.params, renderEnv);
    case "author":
      return resolveAuthor(ctx, match.params, renderEnv);
    case "date":
      return resolveDate(ctx, match.params, renderEnv);
    case "custom":
      return resolveCustom(ctx, match.intent, match.params, renderEnv);
    case "search":
      return resolveSearch(ctx, match.params, renderEnv);
  }
}

async function resolveFrontPage(
  ctx: AppContext,
  params: Record<string, string>,
  renderEnv: RenderEnv,
): Promise<Response> {
  const page = await frontPageData(ctx, params, parsePageParam(params.page));
  if (page === null) return notFound("public-front-page-page-out-of-range");
  return renderListing(ctx, renderEnv, page, "public-front-page-no-template");
}

function decodeSearchQuery(raw: string | undefined): string {
  if (raw === undefined || raw === "") return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    // Malformed percent-sequences fall back to empty — render the bare
    // search template instead of crashing the request.
    return "";
  }
}

async function resolveSearch(
  ctx: AppContext,
  params: Record<string, string>,
  renderEnv: RenderEnv,
): Promise<Response> {
  // Plain HTML search forms submit `GET /search?q=…`; 301 to the canonical
  // path form (`/search/<q>`) so the query renders and the URL is shareable.
  if (params.query === undefined) {
    const q = new URL(ctx.request.url).searchParams.get("q")?.trim();
    if (q) {
      return permanentRedirect(
        withBasePath(`/search/${encodeURIComponent(q)}`, ctx.config.basePath),
      );
    }
  }

  const query = decodeSearchQuery(params.query);
  const page = parsePageParam(params.page);
  const searchableTypes = Array.from(ctx.plugins.entryTypes.entries())
    .filter(([, spec]) => spec.isPublic && !spec.excludeFromSearch)
    .map(([key]) => key);
  const where =
    searchableTypes.length === 0 || query === ""
      ? null
      : and(
          eq(entries.status, "published"),
          isNotNull(entries.publishedAt),
          inArray(entries.type, searchableTypes),
          entrySearchCondition({ value: query, exclude: false }),
        );
  const result = await paginatedEntries(
    ctx,
    where,
    page,
    DEFAULT_ARCHIVE_PER_PAGE,
  );
  if (result.outOfRange) return notFound("public-search-page-out-of-range");
  const initial: SearchData = {
    kind: "search",
    query,
    entries: await resolveEntryList(ctx, result.rows),
    pagination: {
      page,
      perPage: DEFAULT_ARCHIVE_PER_PAGE,
      total: result.total,
      pageCount: result.pageCount,
    },
  };
  const data = await ctx.hooks.applyFilter("resolve:search:data", initial);
  const html = await renderThroughTheme({
    ctx,
    renderEnv,
    node: { kind: "search" },
    data,
    title: data.query ? `Search: ${data.query}` : "Search",
  });
  return htmlResponseOrNotFound(html, "public-search-no-template");
}

async function resolveTaxonomy(
  ctx: AppContext,
  match: RouteMatch,
  intent: Extract<RouteIntent, { kind: "taxonomy" }>,
  renderEnv: RenderEnv,
): Promise<Response> {
  const { params } = match;
  const slug = termSlugParam(params);
  if (slug === null) return notFound("public-term-not-found");
  const term = await findTermBySlug(ctx, intent.taxonomy, slug);
  if (term === null) return notFound("public-term-not-found");

  // The slug found the term; the path around it is only canonical when core
  // compiled the route. A plugin's rule serves at the URL it chose (ADR 0012).
  const url = await buildTermArchiveUrl(ctx, term);
  if (match.isPermalinkRoute && url !== null) {
    const request = new URL(ctx.request.url);
    const canonical =
      params.page === undefined ? url : `${url}/page/${params.page}`;
    if (withBasePath(request.pathname, ctx.config.basePath) !== canonical) {
      return permanentRedirect(`${ctx.origin}${canonical}${request.search}`);
    }
  }

  ctx.resolvedEntity = { kind: "term", id: term.id };

  const page = await termData(
    ctx,
    term,
    url,
    params,
    parsePageParam(params.page),
  );
  if (page === null) return notFound("public-term-page-out-of-range");
  return renderListing(ctx, renderEnv, page, "public-taxonomy-no-template");
}

async function resolveAuthor(
  ctx: AppContext,
  params: Record<string, string>,
  renderEnv: RenderEnv,
): Promise<Response> {
  const author = await findAuthorBySlug(ctx, params.slug ?? "");
  if (author === null) return notFound("public-author-not-found");

  ctx.resolvedEntity = { kind: "author", id: author.id };

  const page = await authorData(
    ctx,
    await resolveAuthorRow(ctx, author),
    params,
    parsePageParam(params.page),
  );
  if (page === null) return notFound("public-author-page-out-of-range");
  return renderListing(ctx, renderEnv, page, "public-author-no-template");
}

async function resolveDate(
  ctx: AppContext,
  params: Record<string, string>,
  renderEnv: RenderEnv,
): Promise<Response> {
  const page = await dateData(
    ctx,
    {
      year: Number(params.year),
      month: params.month === undefined ? null : Number(params.month),
      day: params.day === undefined ? null : Number(params.day),
    },
    params,
    parsePageParam(params.page),
  );
  // One answer for an unparseable date and for a page past the end of a real
  // one: both name a URL with no archive behind it.
  if (page === null) return notFound("public-date-not-found");
  return renderListing(ctx, renderEnv, page, "public-date-no-template");
}

// The open seam: a plugin-registered archive type (`registerArchiveType`). The
// resolver comes from the registry, produces the `{ data, title }` payload (or
// `null` → 404), and templates via a `forArchiveType(name)` rule or `fallback`.
async function resolveCustom(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "custom" }>,
  params: Record<string, string>,
  renderEnv: RenderEnv,
): Promise<Response> {
  const archive = ctx.plugins.archiveTypes.get(intent.name);
  // A compiled route always names a registered archive; the guard is a
  // defensive 404 rather than a throw if the two ever drift.
  if (!archive) return notFound("public-custom-archive-not-registered");
  if (archive.entries !== undefined) {
    return resolveListingArchive(ctx, archive, params, renderEnv);
  }

  const result = await archive.resolve(ctx, params);
  if (result === null) return notFound("public-custom-archive-not-found");

  // Contribute the archive's cache tags through the same per-request
  // accumulator the public read-through folds into the stored response's
  // tags (#1508). A publish of any listed type then purges this page — the
  // coarse invalidation the built-in archives get. Only consumed when the
  // archive opted into caching (`cacheable`); harmless otherwise.
  if (result.tags) accumulateEmbeddedTags(ctx, result.tags);

  const html = await renderThroughTheme({
    ctx,
    renderEnv,
    node: { kind: "custom", name: intent.name },
    data: result.data,
    title: result.title,
  });
  return htmlResponseOrNotFound(html, "public-custom-archive-no-template");
}

/** An archive that declared its entries, with the two listing arms kept apart. */
type ListingArchiveType = Extract<
  RegisteredArchiveType,
  { entries: ArchiveEntries }
>;

/**
 * An archive core lists: `entries` says which entries it is, and core pages,
 * orders, titles and tags them.
 */
async function resolveListingArchive(
  ctx: AppContext,
  archive: ListingArchiveType,
  params: Record<string, string>,
  renderEnv: RenderEnv,
): Promise<Response> {
  const query = archiveEntries(
    ctx,
    { kind: "custom", name: archive.name },
    params,
  );
  if (query === null) return notFound("public-custom-archive-no-entries");

  const page = parsePageParam(params.page);
  const listing = await listEntryPage(ctx, query, {
    page,
    perPage: archive.perPage ?? DEFAULT_ARCHIVE_PER_PAGE,
  });
  // Three distinct 404s, and a developer reading the hint is looking at three
  // different bugs: params the archive declined, a query naming a term or an
  // author nothing answers to, and a page past the end.
  if (listing === null) {
    return notFound("public-custom-archive-query-unresolved");
  }
  if (listing.outOfRange) {
    return notFound("public-custom-archive-page-out-of-range");
  }

  const resolution = await nameListingPage(ctx, archive, params, listing);
  if (resolution === null) return notFound("public-custom-archive-not-found");

  accumulateEmbeddedTags(ctx, listingCdnTags(ctx.plugins, query));

  // Core's half last: the archive's name and page are facts about the request,
  // not fields a resolver gets to restate differently.
  const data: ListingArchiveData = {
    ...resolution.data,
    kind: "custom",
    name: archive.name,
    page,
    entries: listing.entries,
    pagination: listing.pagination,
  };
  const html = await renderThroughTheme({
    ctx,
    renderEnv,
    node: { kind: "custom", name: archive.name },
    data,
    title: resolution.title,
  });
  return htmlResponseOrNotFound(html, "public-custom-archive-no-template");
}

// The two ways a listed archive gets its title, asked separately because that
// is what keeps "it has one" something the types settled rather than a
// fallback invented here. There is no precedence to learn: the arm that
// declares a `title` is the arm whose resolver cannot return one.
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

async function resolveSingle(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "single" }>,
  params: Record<string, string>,
  renderEnv: RenderEnv,
): Promise<Response> {
  const baseRow = await resolveSingleEntry(ctx, intent.entryType, params);
  if (!baseRow) return notFound("public-post-not-found");
  // A preview link renders the minting author's in-progress autosave, so the
  // "Preview current draft" action shows pending edits rather than the live row.
  const overlaid = await overlayPreviewAutosave(ctx, baseRow);
  const row = overlaid ?? baseRow;

  ctx.resolvedEntity = {
    kind: "entry",
    id: row.id,
    preview: overlaid !== null,
  };

  const editMode = resolveEditMode({
    editParam: new URL(ctx.request.url).searchParams.has("plumix.edit"),
    canEdit: canEditEntry(ctx, row),
    previewGrant: await previewTokenGrantsEntry(ctx, row),
  });

  const data = await resolveEntryData(ctx, row);
  const html = await renderThroughTheme({
    ctx,
    renderEnv,
    node: {
      kind: "content",
      entryType: row.type,
      slug: row.slug,
      databaseId: row.id,
    },
    data,
    title: data.entry.title,
    editMode,
  });
  return htmlResponseOrNotFound(html, "public-single-no-template");
}

async function resolveArchive(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "archive" }>,
  params: Record<string, string>,
  renderEnv: RenderEnv,
): Promise<Response> {
  // Set before the listing resolves, as the taxonomy and author routes set
  // theirs: a `resolve:archive:data` subscriber reads the entity off ctx, and
  // it is this route's own intent rather than anything the query returns.
  ctx.resolvedEntity = { kind: "archive", entryType: intent.entryType };

  const page = await archiveData(
    ctx,
    intent.entryType,
    params,
    parsePageParam(params.page),
  );
  if (page === null) return notFound("public-archive-page-out-of-range");
  return renderListing(ctx, renderEnv, page, "public-archive-no-template");
}

// URL :page captures are always strings; invalid input (non-numeric,
// negative, zero) coerces to NaN/<1 and flows into paginate() which
// marks it out-of-range and triggers a 404. Default 1 when the bare
// archive matched (no /page/N).
function parsePageParam(raw: string | undefined): number {
  return raw === undefined ? 1 : Number(raw);
}

/**
 * When a valid `?preview=` token grants this exact entry, overlay the token
 * author's autosave onto the live row for render (see {@link overlayAutosave}).
 * Null on the common no-token / no-autosave paths, where the live row renders.
 */
async function overlayPreviewAutosave(
  ctx: AppContext,
  entry: Entry,
): Promise<Entry | null> {
  const token = readPreviewToken(ctx);
  if (token === null) return null;
  const grant = await verifyPreviewGrant(ctx.db, token);
  if (grant === null) return null;
  if (grant.entryId !== entry.id) return null;
  const autosave = await getAutosave(
    ctx.db,
    { entryId: entry.id, authorId: grant.userId },
    entry,
  );
  return autosave === undefined ? null : overlayAutosave(entry, autosave);
}
