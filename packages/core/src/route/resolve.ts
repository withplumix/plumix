import type { AppContext } from "../context/app.js";
import type { Post } from "../db/schema/posts.js";
import type { RouteIntent } from "./intent.js";
import type { RouteMatch } from "./match.js";
import { and, desc, eq } from "../db/index.js";
import { posts } from "../db/schema/posts.js";
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

  const row = await ctx.db.query.posts.findFirst({
    where: and(
      eq(posts.type, intent.postType),
      eq(posts.slug, slug),
      eq(posts.status, "published"),
    ),
  });
  if (!row) return notFound("public-post-not-found");

  const body = `<article><h1>${escapeHtml(row.title)}</h1>${renderTiptapContent(row.content)}</article>`;
  return htmlResponse(row.title, body);
}

async function resolveArchive(
  ctx: AppContext,
  intent: Extract<RouteIntent, { kind: "archive" }>,
): Promise<Response> {
  const rows = await ctx.db
    .select()
    .from(posts)
    .where(and(eq(posts.type, intent.postType), eq(posts.status, "published")))
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .limit(ARCHIVE_LIMIT);

  const registered = ctx.plugins.postTypes.get(intent.postType);
  const title =
    registered?.labels?.plural ?? registered?.label ?? intent.postType;
  const baseSlug = registered?.rewrite?.slug ?? intent.postType;
  const body =
    rows.length === 0
      ? `<h1>${escapeHtml(title)}</h1><p>No posts yet.</p>`
      : `<h1>${escapeHtml(title)}</h1><ul>${rows.map((row) => renderArchiveItem(row, baseSlug)).join("")}</ul>`;
  return htmlResponse(title, body);
}

function renderArchiveItem(row: Post, baseSlug: string): string {
  const href = baseSlug === "" ? `/${row.slug}` : `/${baseSlug}/${row.slug}`;
  return `<li><a href="${escapeAttr(href)}">${escapeHtml(row.title)}</a></li>`;
}

function htmlResponse(title: string, bodyHtml: string): Response {
  return new Response(renderDefaultDocument({ title, bodyHtml }), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
