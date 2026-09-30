import type { RestResourceHandlerArgs } from "plumix/plugin";
import { sql } from "drizzle-orm";
import * as v from "valibot";

import type { ResolvedCommentsConfig } from "../config.js";
import type { DisplayedCommentRow } from "./displayed-thread.js";
import { resolveCommentableEntry } from "./commentable.js";
import { displayedThread } from "./displayed-thread.js";
import { gravatarUrl } from "./gravatar.js";
import { renderCommentBody } from "./render-body.js";

// Mirrors core's private rest/{schemas,envelope} pagination helpers. Kept local
// while comments is the only plugin REST consumer; promote to a shared
// `@plumix/core/rest` export when a second plugin needs offset pagination.
const MAX_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 20;

/** Where the resource sits; core binds both segments before the handler runs. */
export const COMMENTS_REST_PATH = "/{collection}/{entry}/comments";

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
 * `GET /_plumix/api/v1/{collection}/{entry}/comments` — a flat, offset-paginated
 * list of the entry's displayed thread (the comments the site shows, bounded by
 * `maxDepth`), each carrying `parentId` so clients build the thread. Core binds
 * the entry, so a collection or id that names no readable entry of that
 * collection's type never reaches here. An entry that isn't published and open
 * to anonymous visitors answers the same `NOT_FOUND`, so existence stays
 * hidden; one whose type has commenting off resolves to an empty page.
 */
export function createCommentsRestHandler(config: ResolvedCommentsConfig) {
  return async ({
    context,
    entry,
    errors,
  }: RestResourceHandlerArgs<
    typeof COMMENTS_REST_PATH
  >): Promise<CommentsEnvelope> => {
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

    const entryId = entry.id;
    const resolved = await resolveCommentableEntry(context, entryId, config);
    if (!resolved.ok) {
      if (resolved.reason === "entry_not_found") {
        throw errors.NOT_FOUND({ data: { kind: "entry" } });
      }
      return envelope([], false);
    }

    // Over-fetch one to detect a next page without a separate COUNT.
    const rows = await context.db.all<DisplayedCommentRow>(sql`
      ${displayedThread({ entryId, maxDepth: config.maxDepth })}
      SELECT id, parent_id, author_user_id, author_name, author_email,
             body_md, created_at
      FROM displayed
      ORDER BY created_at ASC, id ASC
      LIMIT ${perPage + 1} OFFSET ${(page - 1) * perPage}
    `);

    const hasNext = rows.length > perPage;
    const pageRows = hasNext ? rows.slice(0, perPage) : rows;
    const data = await Promise.all(
      pageRows.map(async (row) => ({
        id: row.id,
        parentId: row.parent_id,
        authorName: row.author_name,
        isRegistered: row.author_user_id !== null,
        avatarUrl: await gravatarUrl(row.author_email),
        bodyHtml: renderCommentBody(row.body_md),
        createdAt: new Date(row.created_at * 1000),
      })),
    );

    return envelope(data, hasNext);
  };
}
