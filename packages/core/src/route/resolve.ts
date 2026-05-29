import type { SQL } from "drizzle-orm";
import { count } from "drizzle-orm";

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
  FrontPageData,
  ResolvedEntry,
  SingleData,
  TaxonomyData,
} from "./render/resolved-entry.js";
import { and, desc, eq, inArray, isNotNull } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { terms } from "../db/schema/terms.js";
import { users } from "../db/schema/users.js";
import { notFound } from "../runtime/http.js";
import { paginate } from "./paginate.js";
import { findEntryByPath, findTermByPath } from "./path-chain.js";
import { renderThroughTheme } from "./render/render-template.js";

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "resolve:single:data": (
      data: SingleData,
    ) => SingleData | Promise<SingleData>;
    "resolve:archive:data": (
      data: ArchiveData,
    ) => ArchiveData | Promise<ArchiveData>;
    "resolve:term:data": (
      data: TaxonomyData,
    ) => TaxonomyData | Promise<TaxonomyData>;
    "resolve:front-page:data": (
      data: FrontPageData,
    ) => FrontPageData | Promise<FrontPageData>;
  }
}

const DEFAULT_ARCHIVE_PER_PAGE = 20;

export async function resolvePublicRoute(
  ctx: AppContext,
  match: RouteMatch,
  theme: ThemeDescriptor,
  document: DocumentManifest,
  templateDocuments: ReadonlyMap<string, DocumentManifest>,
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
        templateDocuments,
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
        templateDocuments,
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
        templateDocuments,
        templateDeps,
        assetManifest,
      );
    case "front-page":
      return resolveFrontPage(
        ctx,
        match.params,
        theme,
        document,
        templateDocuments,
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
  templateDocuments: ReadonlyMap<string, DocumentManifest>,
  templateDeps: ReadonlyMap<string, RegisteredTemplateDep>,
  assetManifest: AssetManifest,
): Promise<Response> {
  const page = parsePageParam(params.page);
  const publicTypes = Array.from(ctx.plugins.entryTypes.entries())
    .filter(([, spec]) => spec.isPublic !== false)
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
    templateDocuments,
    templateDeps,
    assetManifest,

    node: { kind: "front-page" },
    data,
    title: "Home",
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function resolveTaxonomy(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "taxonomy" }>,
  params: Record<string, string>,
  theme: ThemeDescriptor,
  document: DocumentManifest,
  templateDocuments: ReadonlyMap<string, DocumentManifest>,
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
    taxonomy: intent.taxonomy,
    term,
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
    templateDocuments,
    templateDeps,
    assetManifest,

    node: {
      kind: "term",
      taxonomy: intent.taxonomy,
      slug: term.slug,
      databaseId: term.id,
    },
    data,
    title: taxonomy?.labels?.singular ?? taxonomy?.label ?? term.name,
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function resolveSingle(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "single" }>,
  params: Record<string, string>,
  theme: ThemeDescriptor,
  document: DocumentManifest,
  templateDocuments: ReadonlyMap<string, DocumentManifest>,
  templateDeps: ReadonlyMap<string, RegisteredTemplateDep>,
  assetManifest: AssetManifest,
): Promise<Response> {
  const row = await findEntryForSingle(ctx, intent.entryType, params);
  if (!row) return notFound("public-post-not-found");

  ctx.resolvedEntity = { kind: "entry", id: row.id };

  const [entry] = await buildResolvedEntries(ctx, [row]);
  if (!entry) {
    // eslint-disable-next-line no-restricted-syntax -- diagnostic throw
    throw new Error("buildResolvedEntries: empty result for one row");
  }
  const initial: SingleData = { entry };
  const data = await ctx.hooks.applyFilter("resolve:single:data", initial);
  const html = await renderThroughTheme({
    ctx,
    theme,
    document,
    templateDocuments,
    templateDeps,
    assetManifest,

    node: {
      kind: "content",
      entryType: row.type,
      slug: row.slug,
      databaseId: row.id,
    },
    data,
    title: data.entry.title,
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function resolveArchive(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "archive" }>,
  params: Record<string, string>,
  theme: ThemeDescriptor,
  document: DocumentManifest,
  templateDocuments: ReadonlyMap<string, DocumentManifest>,
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

  const title =
    registered?.labels?.plural ?? registered?.label ?? intent.entryType;

  const initial: ArchiveData = {
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
    templateDocuments,
    templateDeps,
    assetManifest,

    node: { kind: "content-type-archive", entryType: intent.entryType },
    data,
    title,
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Batched eager-load mirroring WordPress's `update_post_caches` semantics:
// one query for authors (IN (...)), one query for the entry_term×terms
// join (IN (...)). Templates read entry.author + entry.terms without N+1.
async function buildResolvedEntries(
  ctx: AppContext,
  rows: readonly Entry[],
): Promise<readonly ResolvedEntry[]> {
  if (rows.length === 0) return [];
  const entryIds = rows.map((r) => r.id);
  const authorIds = Array.from(new Set(rows.map((r) => r.authorId)));
  const [authorRows, joinRows] = await Promise.all([
    ctx.db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, authorIds)),
    ctx.db
      .select({
        entryId: entryTerm.entryId,
        id: terms.id,
        taxonomy: terms.taxonomy,
        name: terms.name,
        slug: terms.slug,
        description: terms.description,
        meta: terms.meta,
        parentId: terms.parentId,
        version: terms.version,
      })
      .from(entryTerm)
      .innerJoin(terms, eq(entryTerm.termId, terms.id))
      .where(inArray(entryTerm.entryId, entryIds)),
  ]);
  const authorById = new Map(authorRows.map((a) => [a.id, a]));
  const termsByEntryId = new Map<number, Term[]>();
  for (const row of joinRows) {
    const { entryId, ...term } = row;
    const bucket = termsByEntryId.get(entryId) ?? [];
    bucket.push(term);
    termsByEntryId.set(entryId, bucket);
  }
  return rows.map((row) => {
    const author = authorById.get(row.authorId);
    if (!author) {
      // eslint-disable-next-line no-restricted-syntax -- diagnostic throw
      throw new Error(
        `buildResolvedEntries: entry ${String(row.id)} references missing author ${String(row.authorId)}`,
      );
    }
    return { ...row, terms: termsByEntryId.get(row.id) ?? [], author };
  });
}

// URL :page captures are always strings; invalid input (non-numeric,
// negative, zero) coerces to NaN/<1 and flows into paginate() which
// marks it out-of-range and triggers a 404. Default 1 when the bare
// archive matched (no /page/N).
function parsePageParam(raw: string | undefined): number {
  return raw === undefined ? 1 : Number(raw);
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
  return (
    (await ctx.db.query.entries.findFirst({
      where: and(
        eq(entries.type, entryType),
        eq(entries.slug, slug),
        eq(entries.status, "published"),
      ),
    })) ?? null
  );
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
