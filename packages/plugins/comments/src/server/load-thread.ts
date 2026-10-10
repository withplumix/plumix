import type { AppContext } from "plumix/plugin";
import { sql } from "drizzle-orm";

import type { DisplayedCommentRow } from "./displayed-thread.js";
import type { ThreadNode } from "./thread.js";
import { displayedThread } from "./displayed-thread.js";
import { gravatarUrl } from "./gravatar.js";
import { renderCommentBody } from "./render-body.js";
import { assembleThread } from "./thread.js";

/**
 * A comment as exposed to the public theme — deliberately omits
 * `authorEmail` and `ipHash`, which stay server-side.
 */
export interface ResolvedComment {
  readonly id: number;
  readonly authorName: string;
  readonly isRegistered: boolean;
  readonly avatarUrl: string;
  readonly bodyHtml: string;
  readonly createdAt: Date;
  readonly replies: readonly ResolvedComment[];
}

/**
 * `count` is computed on the first page only; load-more pages return `0`, as
 * the client already shows the total.
 */
export interface ResolvedThread {
  readonly entryId: number;
  readonly comments: readonly ResolvedComment[];
  readonly count: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

interface LoadThreadOptions {
  readonly maxDepth: number;
  readonly rootsPerPage: number;
  readonly cursor?: string | null;
}

interface RootCursor {
  readonly createdAt: number;
  readonly id: number;
}

/**
 * Keyset, not offset, so comments approved between page loads can't shift the
 * window. Unparseable input is treated as the first page.
 */
function encodeCursor(createdAt: number, id: number): string {
  return `${String(createdAt)}_${String(id)}`;
}

function decodeCursor(cursor: string | null | undefined): RootCursor | null {
  if (!cursor) return null;
  const match = /^(\d+)_(\d+)$/.exec(cursor);
  if (!match) return null;
  return { createdAt: Number(match[1]), id: Number(match[2]) };
}

// Declared beside `ResolvedThread` so a theme importing the type from
// `./server` also gets the `comments` dep kind.
declare module "plumix" {
  interface TemplateDepRegistry {
    comments: { slug: string; result: ResolvedThread };
  }
}

type CommentValue = Omit<ResolvedComment, "replies">;

function toResolved(node: ThreadNode<CommentValue>): ResolvedComment {
  return { ...node.value, replies: node.replies.map(toResolved) };
}

async function countThread(
  ctx: AppContext,
  entryId: number,
  maxDepth: number,
): Promise<number> {
  const [row] = await ctx.db.all<{ c: number }>(sql`
    ${displayedThread({ entryId, maxDepth })}
    SELECT count(*) AS c FROM displayed
  `);
  return row?.c ?? 0;
}

/**
 * Applies no access policy: gate the entry first, as `resolveCommentableEntry`
 * does. Unapproved parents exclude their replies; replies stay chronological
 * per sibling group.
 */
export async function loadThread(
  ctx: AppContext,
  entryId: number,
  options: LoadThreadOptions,
): Promise<ResolvedThread> {
  const { maxDepth, rootsPerPage } = options;
  const before = decodeCursor(options.cursor);

  // Fetch one extra root to detect a further page without a second count.
  const beforeClause = before
    ? sql`AND (created_at < ${before.createdAt}
             OR (created_at = ${before.createdAt} AND id < ${before.id}))`
    : sql``;
  const rootRows = await ctx.db.all<{ id: number; created_at: number }>(sql`
    SELECT id, created_at
    FROM comments
    WHERE entry_id = ${entryId} AND status = 'approved' AND parent_id IS NULL
      ${beforeClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ${rootsPerPage + 1}
  `);

  const hasMore = rootRows.length > rootsPerPage;
  const pageRoots = rootRows.slice(0, rootsPerPage);
  const lastRoot = pageRoots.at(-1);
  const nextCursor =
    hasMore && lastRoot ? encodeCursor(lastRoot.created_at, lastRoot.id) : null;

  // The total is only shown on the first SSR render; skip the full-tree
  // count walk on load-more pages, which discard it.
  const count = before ? 0 : await countThread(ctx, entryId, maxDepth);
  if (pageRoots.length === 0) {
    return { entryId, comments: [], count, hasMore: false, nextCursor: null };
  }

  const rootIds = pageRoots.map((r) => r.id);
  const rows = await ctx.db.all<DisplayedCommentRow>(sql`
    ${displayedThread({ entryId, maxDepth, rootIds })}
    SELECT id, parent_id, author_user_id, author_name, author_email,
           body_md, created_at
    FROM displayed
    ORDER BY created_at ASC, id ASC
  `);

  const inputs = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      parentId: row.parent_id,
      value: {
        id: row.id,
        authorName: row.author_name,
        isRegistered: row.author_user_id !== null,
        avatarUrl: await gravatarUrl(row.author_email),
        bodyHtml: renderCommentBody(row.body_md),
        createdAt: new Date(row.created_at * 1000),
      } satisfies CommentValue,
    })),
  );

  // `assembleThread` nests in chronological input order; re-sort the roots
  // (only) newest-first so the page matches the cursor ordering. Replies
  // keep their chronological order.
  const comments = assembleThread(inputs)
    .map(toResolved)
    .sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
    );

  return { entryId, comments, count, hasMore, nextCursor };
}
