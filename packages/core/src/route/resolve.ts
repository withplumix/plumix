import type { SQL } from "drizzle-orm";
import { count } from "drizzle-orm";

import { expandShortcodes } from "@plumix/blocks";

import type { AppContext } from "../context/app.js";
import type { Entry } from "../db/schema/entries.js";
import type { Term } from "../db/schema/terms.js";
import type { RegisteredTemplateDep } from "../template-deps.js";
import type { DocumentManifest, ThemeDescriptor } from "../theme.js";
import type { RouteIntent } from "./intent.js";
import type { RouteMatch } from "./match.js";
import type { AssetManifest } from "./render/asset-manifest.js";
import type {
  ArchiveData,
  EntryData,
  FrontPageData,
  SearchData,
  TaxonomyData,
} from "./render/resolved-entry.js";
import { verifyPreviewGrant } from "../auth/preview-token.js";
import { withBasePath } from "../base-path.js";
import { and, desc, eq, inArray, isNotNull, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { terms } from "../db/schema/terms.js";
import { labelSourceText } from "../i18n/label.js";
import { getAutosave } from "../revisions/repository.js";
import { stripReservedMeta } from "../revisions/snapshot-envelope.js";
import { entryCapability } from "../rpc/procedures/entry/lifecycle.js";
import { notFound, permanentRedirect } from "../runtime/http.js";
import { resolveEditMode } from "./edit-mode.js";
import { paginate } from "./paginate.js";
import { findEntryByPath, findTermByPath } from "./path-chain.js";
import { buildTermArchiveUrl } from "./permalink.js";
import { previewTokenGrantsEntry, readPreviewToken } from "./preview.js";
import { buildResolvedEntries } from "./render/build-resolved-entries.js";
import { renderThroughTheme } from "./render/render-template.js";

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "resolve:single:data": (data: EntryData) => EntryData | Promise<EntryData>;
    "resolve:archive:data": (
      data: ArchiveData,
    ) => ArchiveData | Promise<ArchiveData>;
    "resolve:term:data": (
      data: TaxonomyData,
    ) => TaxonomyData | Promise<TaxonomyData>;
    "resolve:front-page:data": (
      data: FrontPageData,
    ) => FrontPageData | Promise<FrontPageData>;
    "resolve:search:data": (
      data: SearchData,
    ) => SearchData | Promise<SearchData>;
  }
}

const DEFAULT_ARCHIVE_PER_PAGE = 20;

// `renderThroughTheme` returns `null` when the theme has no rule for the node
// and no `fallback` — a 404, per the router-style resolution model.
function htmlResponseOrNotFound(html: string | null, reason: string): Response {
  if (html === null) return notFound(reason);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function resolvePublicRoute(
  ctx: AppContext,
  match: RouteMatch,
  theme: ThemeDescriptor,
  document: DocumentManifest,
  templateDeps: ReadonlyMap<string, RegisteredTemplateDep>,
  assetManifest: AssetManifest,
): Promise<Response> {
  switch (match.intent.kind) {
    case "single":
      return resolveSingle(
        ctx,
        match.intent,
        match.params,
        theme,
        document,
        templateDeps,
        assetManifest,
      );
    case "archive":
      return resolveArchive(
        ctx,
        match.intent,
        match.params,
        theme,
        document,
        templateDeps,
        assetManifest,
      );
    case "taxonomy":
      return resolveTaxonomy(
        ctx,
        match.intent,
        match.params,
        theme,
        document,
        templateDeps,
        assetManifest,
      );
    case "front-page":
      return resolveFrontPage(
        ctx,
        match.params,
        theme,
        document,
        templateDeps,
        assetManifest,
      );
    case "search":
      return resolveSearch(
        ctx,
        match.params,
        theme,
        document,
        templateDeps,
        assetManifest,
      );
  }
}

async function resolveFrontPage(
  ctx: AppContext,
  params: Record<string, string>,
  theme: ThemeDescriptor,
  document: DocumentManifest,
  templateDeps: ReadonlyMap<string, RegisteredTemplateDep>,
  assetManifest: AssetManifest,
): Promise<Response> {
  const page = parsePageParam(params.page);
  // The latest-posts front feed excludes hierarchical types (pages) — they
  // are standalone content, not blog entries. (A configurable front-page /
  // posts-page model is the larger follow-up.)
  const publicTypes = Array.from(ctx.plugins.entryTypes.entries())
    .filter(
      ([, spec]) => spec.isPublic !== false && spec.isHierarchical !== true,
    )
    .map(([key]) => key);
  const where =
    publicTypes.length === 0
      ? null
      : and(
          eq(entries.status, "published"),
          isNotNull(entries.publishedAt),
          inArray(entries.type, publicTypes),
        );
  const result = await paginatedEntries(
    ctx,
    where,
    page,
    DEFAULT_ARCHIVE_PER_PAGE,
  );
  if (result.outOfRange) return notFound("public-front-page-page-out-of-range");

  const initial: FrontPageData = {
    kind: "frontPage",
    entries: await buildResolvedEntries(ctx, result.rows),
    pagination: {
      page,
      perPage: DEFAULT_ARCHIVE_PER_PAGE,
      total: result.total,
      pageCount: result.pageCount,
    },
  };
  const data = await ctx.hooks.applyFilter("resolve:front-page:data", initial);
  const html = await renderThroughTheme({
    ctx,
    theme,
    document,
    templateDeps,
    assetManifest,

    node: { kind: "front-page" },
    data,
    // Public-route content i18n is a deferred userland seam; "Home"
    // (site root) stays English here.
    title: "Home",
  });
  return htmlResponseOrNotFound(html, "public-front-page-no-template");
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
  theme: ThemeDescriptor,
  document: DocumentManifest,
  templateDeps: ReadonlyMap<string, RegisteredTemplateDep>,
  assetManifest: AssetManifest,
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
    .filter(
      ([, spec]) => spec.isPublic !== false && spec.excludeFromSearch !== true,
    )
    .map(([key]) => key);
  // Escape SQL LIKE wildcards in the user query so `_` and `%` match
  // literal characters instead of any-char / any-string.
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const where =
    searchableTypes.length === 0 || query === ""
      ? null
      : and(
          eq(entries.status, "published"),
          isNotNull(entries.publishedAt),
          inArray(entries.type, searchableTypes),
          sql`${entries.title} LIKE ${`%${escaped}%`} ESCAPE '\\'`,
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
    theme,
    document,
    templateDeps,
    assetManifest,
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
  theme: ThemeDescriptor,
  document: DocumentManifest,
  templateDeps: ReadonlyMap<string, RegisteredTemplateDep>,
  assetManifest: AssetManifest,
): Promise<Response> {
  const term = await findTermForTaxonomy(ctx, intent.taxonomy, params);
  if (!term) return notFound("public-term-not-found");

  ctx.resolvedEntity = { kind: "term", id: term.id };

  const taxonomy = ctx.plugins.termTaxonomies.get(intent.taxonomy);
  const allowedTypes = taxonomy?.entryTypes ?? [];
  const page = parsePageParam(params.page);

  // Empty `allowedTypes` short-circuits — a taxonomy registered without
  // any attached entry types yields an empty archive.
  const where =
    allowedTypes.length === 0
      ? null
      : and(
          eq(entries.status, "published"),
          isNotNull(entries.publishedAt),
          inArray(entries.type, allowedTypes),
          inArray(
            entries.id,
            ctx.db
              .select({ id: entryTerm.entryId })
              .from(entryTerm)
              .where(eq(entryTerm.termId, term.id)),
          ),
        );

  const perPage = taxonomy?.archivePerPage ?? DEFAULT_ARCHIVE_PER_PAGE;
  const result = await paginatedEntries(ctx, where, page, perPage);
  if (result.outOfRange) return notFound("public-term-page-out-of-range");

  const initial: TaxonomyData = {
    kind: "taxonomy",
    taxonomy: intent.taxonomy,
    // Single archive term: the async builder walks ancestors for the full
    // nested URL (one call — no N+1).
    term: { ...term, url: await buildTermArchiveUrl(ctx, term) },
    entries: await buildResolvedEntries(ctx, result.rows),
    pagination: {
      page,
      perPage,
      total: result.total,
      pageCount: result.pageCount,
    },
  };
  const data = await ctx.hooks.applyFilter("resolve:term:data", initial);
  const html = await renderThroughTheme({
    ctx,
    theme,
    document,
    templateDeps,
    assetManifest,

    node: {
      kind: "term",
      taxonomy: intent.taxonomy,
      slug: term.slug,
      databaseId: term.id,
    },
    data,
    title: taxonomy
      ? labelSourceText(taxonomy.labels?.singular ?? taxonomy.label)
      : term.name,
  });
  return htmlResponseOrNotFound(html, "public-taxonomy-no-template");
}

async function resolveSingle(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "single" }>,
  params: Record<string, string>,
  theme: ThemeDescriptor,
  document: DocumentManifest,
  templateDeps: ReadonlyMap<string, RegisteredTemplateDep>,
  assetManifest: AssetManifest,
): Promise<Response> {
  const baseRow = await findEntryForSingle(ctx, intent.entryType, params);
  if (!baseRow) return notFound("public-post-not-found");
  // A preview link renders the minting author's in-progress autosave, so the
  // "Preview current draft" action shows pending edits rather than the live row.
  const row = await overlayPreviewAutosave(ctx, baseRow);

  ctx.resolvedEntity = { kind: "entry", id: row.id };

  const editMode = resolveEditMode({
    editParam: new URL(ctx.request.url).searchParams.has("plumix.edit"),
    canEdit:
      ctx.auth.can(entryCapability(row.type, "edit_any")) ||
      (ctx.user?.id === row.authorId &&
        ctx.auth.can(entryCapability(row.type, "edit_own"))),
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
  const entryContext = data.entry as unknown as Readonly<
    Record<string, unknown>
  >;
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
    theme,
    document,
    templateDeps,
    assetManifest,

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
  theme: ThemeDescriptor,
  document: DocumentManifest,
  templateDeps: ReadonlyMap<string, RegisteredTemplateDep>,
  assetManifest: AssetManifest,
): Promise<Response> {
  const page = parsePageParam(params.page);
  const where = and(
    eq(entries.type, intent.entryType),
    eq(entries.status, "published"),
    isNotNull(entries.publishedAt),
  );

  const registered = ctx.plugins.entryTypes.get(intent.entryType);
  const perPage = registered?.archivePerPage ?? DEFAULT_ARCHIVE_PER_PAGE;
  const result = await paginatedEntries(ctx, where, page, perPage);
  if (result.outOfRange) return notFound("public-archive-page-out-of-range");

  // Set after the query so a thrown query doesn't leave a stale entity
  // on ctx for any downstream middleware (logging, error pages) that
  // reads it.
  ctx.resolvedEntity = { kind: "archive", entryType: intent.entryType };

  // SSR-side: descriptor labels fall back to source text until the
  // ctx.i18n route wiring lands (slice 11 #680 covered tRPC errors;
  // route titles pending).
  const title = registered
    ? labelSourceText(registered.labels?.plural ?? registered.label)
    : intent.entryType;

  const initial: ArchiveData = {
    kind: "archive",
    contentType: intent.entryType,
    entries: await buildResolvedEntries(ctx, result.rows),
    pagination: {
      page,
      perPage,
      total: result.total,
      pageCount: result.pageCount,
    },
  };
  const data = await ctx.hooks.applyFilter("resolve:archive:data", initial);
  const html = await renderThroughTheme({
    ctx,
    theme,
    document,
    templateDeps,
    assetManifest,

    node: { kind: "content-type-archive", entryType: intent.entryType },
    data,
    title,
  });
  return htmlResponseOrNotFound(html, "public-archive-no-template");
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
  const autosave = await getAutosave(ctx.db, {
    entryId: entry.id,
    authorId: grant.userId,
  });
  if (!autosave) return entry;
  return {
    ...entry,
    title: autosave.title,
    content: autosave.content,
    excerpt: autosave.excerpt,
    meta: stripReservedMeta(autosave.meta),
  };
}

async function findEntryForSingle(
  ctx: AppContext,
  entryType: string,
  params: Record<string, string>,
): Promise<Entry | null> {
  const path = params.path;
  if (typeof path === "string" && path !== "") {
    return findEntryByPath(ctx, entryType, path.split("/"));
  }
  const slug = params.slug;
  if (typeof slug !== "string" || slug === "") return null;
  const published = await ctx.db.query.entries.findFirst({
    where: and(
      eq(entries.type, entryType),
      eq(entries.slug, slug),
      eq(entries.status, "published"),
    ),
  });
  if (published) return published;
  // A valid `?preview=` token can reveal the matching draft. Skip the extra
  // query entirely on the common no-token 404.
  if (readPreviewToken(ctx) === null) return null;
  const candidate = await ctx.db.query.entries.findFirst({
    where: and(eq(entries.type, entryType), eq(entries.slug, slug)),
  });
  if (!candidate) return null;
  return (await previewTokenGrantsEntry(ctx, candidate)) ? candidate : null;
}

async function findTermForTaxonomy(
  ctx: AppContext,
  taxonomy: string,
  params: Record<string, string>,
): Promise<Term | null> {
  const path = params.path;
  if (typeof path === "string" && path !== "") {
    return findTermByPath(ctx, taxonomy, path.split("/"));
  }
  const slug = params.term;
  if (typeof slug !== "string" || slug === "") return null;
  return (
    (await ctx.db.query.terms.findFirst({
      where: and(eq(terms.taxonomy, taxonomy), eq(terms.slug, slug)),
    })) ?? null
  );
}

/**
 * Shared paginated-entries query used by archive and taxonomy
 * resolvers. Returns `{ outOfRange: true }` so the caller can pick the
 * 404 reason. `where === null` short-circuits to an empty result with
 * no DB round-trip — used by the taxonomy resolver when a taxonomy is
 * registered without any attached entry types.
 */
async function paginatedEntries(
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
