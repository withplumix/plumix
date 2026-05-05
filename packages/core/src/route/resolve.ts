import type { AppContext } from "../context/app.js";
import type { Entry } from "../db/schema/entries.js";
import type { RouteIntent } from "./intent.js";
import type { RouteMatch } from "./match.js";
import { and, desc, eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { notFound } from "../runtime/http.js";
import {
  escapeAttr,
  escapeHtml,
  renderDefaultDocument,
} from "./render/document.js";
import { renderTiptapContent } from "./render/tiptap.js";

const ARCHIVE_LIMIT = 20;

export async function resolvePublicRoute(
  ctx: AppContext,
  match: RouteMatch,
): Promise<Response> {
  switch (match.intent.kind) {
    case "single":
      return resolveSingle(ctx, match.intent, match.params);
    case "archive":
      return resolveArchive(ctx, match.intent);
  }
}

async function resolveSingle(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "single" }>,
  params: Record<string, string>,
): Promise<Response> {
  const slug = params.slug;
  if (typeof slug !== "string" || slug === "") {
    return notFound("public-route-slug-missing");
  }

  const row = await ctx.db.query.entries.findFirst({
    where: and(
      eq(entries.type, intent.entryType),
      eq(entries.slug, slug),
      eq(entries.status, "published"),
    ),
  });
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
): Promise<Response> {
  const rows = await ctx.db
    .select()
    .from(entries)
    .where(
      and(eq(entries.type, intent.entryType), eq(entries.status, "published")),
    )
    .orderBy(desc(entries.publishedAt), desc(entries.id))
    .limit(ARCHIVE_LIMIT);

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

function renderArchiveItem(row: Entry, baseSlug: string): string {
  const href = baseSlug === "" ? `/${row.slug}` : `/${baseSlug}/${row.slug}`;
  return `<li><a href="${escapeAttr(href)}">${escapeHtml(row.title)}</a></li>`;
}

function htmlResponse(title: string, bodyHtml: string): Response {
  return new Response(renderDefaultDocument({ title, bodyHtml }), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
