import { expandShortcodes } from "@plumix/blocks";

import type { AppContext } from "../context/app.js";
import type { Entry } from "../db/schema/entries.js";
import type { JsonObject } from "../json.js";
import type {
  ArchiveEntries,
  RegisteredArchiveType,
  TitledListingArchiveResolution,
} from "../plugin/manifest.js";
import type { RouteIntent } from "./intent.js";
import type { RouteMatch } from "./match.js";
import type { EntryListing } from "./render/entry-listing.js";
import type { ResolvedListingPage } from "./render/page-data.js";
import type { RenderEnv } from "./render/render-env.js";
import type {
  EntryData,
  ListingArchiveData,
  SearchData,
} from "./render/resolved-entry.js";
import { ACCESS_POLICY_META_KEY } from "../access/meta-key.js";
import { verifyPreviewGrant } from "../auth/preview-token.js";
import { withBasePath } from "../base-path.js";
import { accumulateEmbeddedTags } from "../cdn/embedded-tags.js";
import { and, eq, inArray, isNotNull } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { canEditEntry } from "../entries/editability.js";
import { getAutosave } from "../revisions/repository.js";
import { stripReservedMeta } from "../revisions/snapshot-envelope.js";
import { notFound, permanentRedirect } from "../runtime/http.js";
import { entrySearchCondition } from "../search/conditions.js";
import { archiveEntries, termPathParam } from "./archive-entries.js";
import { resolveEditMode } from "./edit-mode.js";
import { findAuthorBySlug, findTermAt } from "./path-chain.js";
import { previewTokenGrantsEntry, readPreviewToken } from "./preview.js";
import {
  buildResolvedEntries,
  resolveAuthorRow,
} from "./render/build-resolved-entries.js";
import { listEntryPage, listingCdnTags } from "./render/entry-listing.js";
import {
  archiveData,
  authorData,
  dateData,
  DEFAULT_ARCHIVE_PER_PAGE,
  frontPageData,
  paginatedEntries,
  termData,
} from "./render/page-data.js";
import { renderThroughTheme } from "./render/render-template.js";
import { NAMED_TEMPLATE_META_KEY } from "./render/template-builders.js";
import { resolveSingleEntry } from "./single-entry.js";

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "resolve:single:data": (data: EntryData) => EntryData | Promise<EntryData>;
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
  ctx.resolvedRoute = match;
  switch (match.intent.kind) {
    case "single":
      return resolveSingle(ctx, match.intent, match.params, renderEnv);
    case "archive":
      return resolveArchive(ctx, match.intent, match.params, renderEnv);
    case "taxonomy":
      return resolveTaxonomy(ctx, match.intent, match.params, renderEnv);
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
        withBasePath(`/search/${encodeURIComponent(q)}`, ctx.basePath),
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
    entries: await buildResolvedEntries(ctx, result.rows),
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
  intent: Extract<RouteIntent, { kind: "taxonomy" }>,
  params: Record<string, string>,
  renderEnv: RenderEnv,
): Promise<Response> {
  const path = termPathParam(params);
  if (path === null) return notFound("public-term-not-found");
  const term = await findTermAt(ctx, intent.taxonomy, path);
  if (term === null) return notFound("public-term-not-found");

  ctx.resolvedEntity = { kind: "term", id: term.id };

  const page = await termData(ctx, term, params, parsePageParam(params.page));
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
  const row = await overlayPreviewAutosave(ctx, baseRow);

  ctx.resolvedEntity = { kind: "entry", id: row.id };

  const editMode = resolveEditMode({
    editParam: new URL(ctx.request.url).searchParams.has("plumix.edit"),
    canEdit: canEditEntry(ctx, row),
    previewGrant: await previewTokenGrantsEntry(ctx, row),
  });

  const [entry] = await buildResolvedEntries(ctx, [row]);
  if (!entry) {
    // eslint-disable-next-line no-restricted-syntax -- diagnostic throw
    throw new Error("buildResolvedEntries: empty result for one row");
  }
  const initial: EntryData = { kind: "entry", entry };
  const data = await ctx.hooks.applyFilter("resolve:single:data", initial);
  // Expand shortcodes in the author-written entry title so both the
  // document `<title>` and the theme-rendered heading resolve `[year]` &c.
  // The spread is what makes the entry readable as an open bag: a shortcode
  // looks its fields up by name, and TypeScript withholds the implicit index
  // signature an `interface` would need to be read that way.
  const entryContext = { ...data.entry };
  const title = expandShortcodes(data.entry.title, ctx.shortcodes, {
    siteSettings: {},
    locale: ctx.locale.code,
    entry: entryContext,
  });
  const expanded: EntryData = {
    ...data,
    entry: { ...data.entry, title },
  };
  const html = await renderThroughTheme({
    ctx,
    renderEnv,
    node: {
      kind: "content",
      entryType: row.type,
      slug: row.slug,
      databaseId: row.id,
    },
    data: expanded,
    title,
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
 * author's autosave onto the live row for render. Reserved `__plumix_*` meta
 * keys are stripped so the bag matches a live row's shape, and the live
 * slug/parentId are kept so the permalink stays correct. Passthrough on the
 * common no-token / no-autosave paths.
 */
async function overlayPreviewAutosave(
  ctx: AppContext,
  entry: Entry,
): Promise<Entry> {
  if (entry.status === "trash") return entry;
  const token = readPreviewToken(ctx);
  if (token === null) return entry;
  const grant = await verifyPreviewGrant(ctx.db, token);
  if (grant === null) return entry;
  if (grant.entryId !== entry.id) return entry;
  const autosave = await getAutosave(
    ctx.db,
    { entryId: entry.id, authorId: grant.userId },
    entry,
  );
  if (!autosave) return entry;
  // Overlay only the drafted fields. `title` / `slug` / `parentId` / terms are
  // live fields (the editor writes them with `saveAs: "live"`), so they come
  // from `entry` — the autosave's `title` column is a stale snapshot frozen at
  // the last draft write and must not override a later live title edit.
  return {
    ...entry,
    content: autosave.content,
    excerpt: autosave.excerpt,
    // Keep the reserved template key so an unsaved `named`-template pick still
    // drives resolution — otherwise preview would fall back to the default.
    meta: withLiveAccessChoice(
      entry.meta,
      stripReservedMeta(autosave.meta, [NAMED_TEMPLATE_META_KEY]),
    ),
  };
}

/**
 * Carry the *live* row's per-entry access choice through the overlay. Unlike
 * the template pick, an unsaved access pick must not drive the preview: the
 * gate resolves its policy from the persisted row (`policyForMatch` never sees
 * this overlay), so a bag reporting the draft's pick would tell the page one
 * thing about its own visibility and the gate another — and anything the page
 * publishes on the entry's behalf, a social card above all, would be decided
 * against a choice that gates nothing.
 */
function withLiveAccessChoice(
  live: JsonObject,
  drafted: JsonObject,
): JsonObject {
  const choice = live[ACCESS_POLICY_META_KEY];
  return choice === undefined
    ? drafted
    : { ...drafted, [ACCESS_POLICY_META_KEY]: choice };
}
