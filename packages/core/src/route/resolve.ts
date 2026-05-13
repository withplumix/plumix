import type { SQL } from "drizzle-orm";
import { count } from "drizzle-orm";

import type { AppContext } from "../context/app.js";
import type { Entry } from "../db/schema/entries.js";
import type { Term } from "../db/schema/terms.js";
import type { RouteIntent } from "./intent.js";
import type { RouteMatch } from "./match.js";
import { and, desc, eq, inArray } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { terms } from "../db/schema/terms.js";
import { notFound } from "../runtime/http.js";
import { paginate } from "./paginate.js";
import { findEntryByPath, findTermByPath } from "./path-chain.js";
import {
  escapeAttr,
  escapeHtml,
  renderDefaultDocument,
} from "./render/document.js";
import { renderTiptapContent } from "./render/tiptap.js";

interface ResolvedTaxonomyData {
  readonly taxonomy: string;
  readonly term: Term;
  readonly entries: readonly Entry[];
}

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "resolve:taxonomy:data": (
      data: ResolvedTaxonomyData,
    ) => ResolvedTaxonomyData | Promise<ResolvedTaxonomyData>;
  }
}

const ARCHIVE_LIMIT = 20;

export async function resolvePublicRoute(
  ctx: AppContext,
  match: RouteMatch,
): Promise<Response> {
  switch (match.intent.kind) {
    case "single":
      return resolveSingle(ctx, match.intent, match.params);
    case "archive":
      return resolveArchive(ctx, match.intent, match.params);
    case "taxonomy":
      return resolveTaxonomy(ctx, match.intent, match.params);
  }
}

async function resolveTaxonomy(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "taxonomy" }>,
  params: Record<string, string>,
): Promise<Response> {
  // Same dispatch as resolveSingle: `:path+` rules surface params.path
  // (multi-segment), flat `:term` rules surface params.term.
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
          inArray(entries.type, allowedTypes),
          inArray(
            entries.id,
            ctx.db
              .select({ id: entryTerm.entryId })
              .from(entryTerm)
              .where(eq(entryTerm.termId, term.id)),
          ),
        );

  const result = await paginatedEntries(ctx, where, page);
  if (result.outOfRange) return notFound("public-term-page-out-of-range");
  const rows = result.rows;

  // Run plugin filters before render so plugins can mutate the resolved
  // shape (drop entries, append plugin-contributed fields, etc.) without
  // forking the resolver. Mirrors WP's `pre_get_posts` ergonomics.
  const data = await ctx.hooks.applyFilter("resolve:taxonomy:data", {
    taxonomy: intent.taxonomy,
    term,
    entries: rows,
  });

  const title = taxonomy?.labels?.singular ?? taxonomy?.label ?? data.term.name;
  const heading = escapeHtml(data.term.name);
  const body =
    data.entries.length === 0
      ? `<h1>${heading}</h1><p>No entries yet.</p>`
      : `<h1>${heading}</h1><ul>${data.entries.map(renderTaxonomyItem).join("")}</ul>`;
  return htmlResponse(title, body);
}

function renderTaxonomyItem(row: Entry): string {
  // Reuse the entry-type's permalink base — taxonomy archives can mix
  // multiple entry types, so each item needs its own type-specific URL.
  const href = `/${row.type}/${row.slug}`;
  return `<li><a href="${escapeAttr(href)}">${escapeHtml(row.title)}</a></li>`;
}

async function resolveSingle(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "single" }>,
  params: Record<string, string>,
): Promise<Response> {
  // `:path+` rules surface their capture as `params.path` (multi-segment);
  // flat `:slug` rules surface a single segment as `params.slug`. The
  // route compiler picks the capture name based on rewrite.isHierarchical
  // — the resolver dispatches off whichever one was set.
  const row = await findEntryForSingle(ctx, intent.entryType, params);
  if (!row) return notFound("public-post-not-found");

  // Stash the matched entity so render-side helpers (menu plugin's
  // `isCurrent`, breadcrumbs, canonical tags) can identify the
  // current page without re-running URL matching.
  ctx.resolvedEntity = { kind: "entry", id: row.id };

  const body = `<article><h1>${escapeHtml(row.title)}</h1>${renderTiptapContent(row.content)}</article>`;
  return htmlResponse(row.title, body);
}

async function resolveArchive(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "archive" }>,
  params: Record<string, string>,
): Promise<Response> {
  const page = parsePageParam(params.page);
  const where = and(
    eq(entries.type, intent.entryType),
    eq(entries.status, "published"),
  );

  const result = await paginatedEntries(ctx, where, page);
  if (result.outOfRange) return notFound("public-archive-page-out-of-range");
  const rows = result.rows;

  // Set after the query so a thrown query doesn't leave a stale entity
  // on ctx for any downstream middleware (logging, error pages) that
  // reads it. Mirrors `resolveSingle`.
  ctx.resolvedEntity = { kind: "archive", entryType: intent.entryType };

  const registered = ctx.plugins.entryTypes.get(intent.entryType);
  const title =
    registered?.labels?.plural ?? registered?.label ?? intent.entryType;
  const baseSlug = registered?.rewrite?.slug ?? intent.entryType;
  const body =
    rows.length === 0
      ? `<h1>${escapeHtml(title)}</h1><p>No entries yet.</p>`
      : `<h1>${escapeHtml(title)}</h1><ul>${rows.map((row) => renderArchiveItem(row, baseSlug)).join("")}</ul>`;
  return htmlResponse(title, body);
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
): Promise<{ readonly rows: readonly Entry[]; readonly outOfRange: boolean }> {
  if (where == null) {
    const slice = paginate({ page, perPage: ARCHIVE_LIMIT, total: 0 });
    return { rows: [], outOfRange: slice.outOfRange };
  }

  const totalRow = await ctx.db
    .select({ total: count() })
    .from(entries)
    .where(where);
  const total = totalRow[0]?.total ?? 0;

  const slice = paginate({ page, perPage: ARCHIVE_LIMIT, total });
  if (slice.outOfRange) return { rows: [], outOfRange: true };

  const rows = await ctx.db
    .select()
    .from(entries)
    .where(where)
    .orderBy(desc(entries.publishedAt), desc(entries.id))
    .limit(slice.limit)
    .offset(slice.offset);
  return { rows, outOfRange: false };
}

function renderArchiveItem(row: Entry, baseSlug: string): string {
  const href = baseSlug === "" ? `/${row.slug}` : `/${baseSlug}/${row.slug}`;
  return `<li><a href="${escapeAttr(href)}">${escapeHtml(row.title)}</a></li>`;
}

function htmlResponse(title: string, bodyHtml: string): Response {
  return new Response(renderDefaultDocument({ title, bodyHtml }), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
