import type { AppContext } from "plumix/plugin";
import { and, asc, eq } from "drizzle-orm";
import { entries } from "plumix/schema";
import * as v from "valibot";

import type { ResolvedCommentsConfig } from "../config.js";
import { comments } from "../db/schema.js";
import { isCommentingEnabled } from "./enablement.js";
import { gravatarUrl } from "./gravatar.js";
import { renderCommentBody } from "./render-body.js";

// Mirrors core's private rest/{schemas,envelope} pagination helpers. Kept local
// while comments is the only plugin REST consumer; promote to a shared
// `@plumix/core/rest` export when a second plugin needs offset pagination.
const MAX_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 20;

export const commentCollectionParamsSchema = v.object({
  type: v.string(),
  id: v.string(),
});

// Output schema = the public allowlist. Author email, IP, user-agent, the
// moderation status, and meta never appear — only these fields leave.
const publicCommentSchema = v.object({
  id: v.number(),
  parentId: v.nullable(v.number()),
  authorName: v.string(),
  isRegistered: v.boolean(),
  avatarUrl: v.string(),
  bodyHtml: v.string(),
  createdAt: v.date(),
});

export const commentsEnvelopeSchema = v.object({
  data: v.array(publicCommentSchema),
  meta: v.object({ page: v.number(), per_page: v.number() }),
  links: v.object({
    self: v.string(),
    next: v.optional(v.string()),
    prev: v.optional(v.string()),
  }),
});

type CommentsEnvelope = v.InferOutput<typeof commentsEnvelopeSchema>;

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Relative path + query so links don't pin the response to an internal origin;
// clients resolve them against the request base.
function pageUrl(url: URL, page: number): string {
  const next = new URL(url);
  next.searchParams.set("page", String(page));
  return `${next.pathname}${next.search}`;
}

/**
 * `GET /_plumix/api/v1/{type}/{id}/comments` — a flat, offset-paginated list of
 * approved comments for an entry, each carrying `parentId` so clients build the
 * thread. Comments of an entry that isn't a published, comment-enabled one
 * resolve to an empty page (existence stays hidden, no 403/404 to probe).
 */
export function createCommentsRestHandler(config: ResolvedCommentsConfig) {
  return async ({
    input,
    context,
  }: {
    input: v.InferOutput<typeof commentCollectionParamsSchema>;
    context: AppContext;
  }): Promise<CommentsEnvelope> => {
    const url = new URL(context.request.url);
    const page = clampInt(
      url.searchParams.get("page"),
      1,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const perPage = clampInt(
      url.searchParams.get("per_page"),
      DEFAULT_PER_PAGE,
      1,
      MAX_PER_PAGE,
    );
    const envelope = (
      data: CommentsEnvelope["data"],
      hasNext: boolean,
    ): CommentsEnvelope => ({
      data,
      meta: { page, per_page: perPage },
      links: {
        self: pageUrl(url, page),
        ...(hasNext ? { next: pageUrl(url, page + 1) } : {}),
        ...(page > 1 ? { prev: pageUrl(url, page - 1) } : {}),
      },
    });

    const entryId = Number(input.id);
    if (!Number.isInteger(entryId) || entryId < 1) return envelope([], false);

    const [entry] = await context.db
      .select({ type: entries.type, status: entries.status })
      .from(entries)
      .where(eq(entries.id, entryId));
    if (entry?.status !== "published") return envelope([], false);
    const supports = context.plugins.entryTypes.get(entry.type)?.supports;
    if (!isCommentingEnabled(entry.type, supports, config)) {
      return envelope([], false);
    }

    // Over-fetch one to detect a next page without a separate COUNT.
    const rows = await context.db
      .select({
        id: comments.id,
        parentId: comments.parentId,
        authorUserId: comments.authorUserId,
        authorName: comments.authorName,
        authorEmail: comments.authorEmail,
        bodyMd: comments.bodyMd,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(
        and(eq(comments.entryId, entryId), eq(comments.status, "approved")),
      )
      .orderBy(asc(comments.createdAt), asc(comments.id))
      .limit(perPage + 1)
      .offset((page - 1) * perPage);

    const hasNext = rows.length > perPage;
    const pageRows = hasNext ? rows.slice(0, perPage) : rows;
    const data = await Promise.all(
      pageRows.map(async (row) => ({
        id: row.id,
        parentId: row.parentId,
        authorName: row.authorName,
        isRegistered: row.authorUserId !== null,
        avatarUrl: await gravatarUrl(row.authorEmail),
        bodyHtml: renderCommentBody(row.bodyMd),
        createdAt: row.createdAt,
      })),
    );

    return envelope(data, hasNext);
  };
}
