import type { AppContext } from "plumix/plugin";
import { sql } from "drizzle-orm";

import type { ThreadNode } from "./thread.js";
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

/** The assembled comment thread for one entry. `count` is every approved
 * comment in the displayed tree (depth-bounded, orphans excluded) — but
 * only on the first page (no `cursor`); load-more pages return `0`, since
 * the client already rendered the total and recounting the whole tree on
 * every fetch is wasted work. `comments` are the roots for the requested
 * page (newest first, each with nested replies). `hasMore` flags older
 * roots beyond this page, reachable by passing `nextCursor` back to
 * `GET /_plumix/comments/list`. */
export interface ResolvedThread {
  readonly entryId: number;
  readonly comments: readonly ResolvedComment[];
  readonly count: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

/** One page of root comments to load. `cursor` is an opaque
 * `GET /_plumix/comments/list` token from a prior `nextCursor`; omit it
 * for the first (newest) page. */
interface LoadThreadOptions {
  readonly maxDepth: number;
  readonly rootsPerPage: number;
  readonly cursor?: string | null;
}

interface RootCursor {
  readonly createdAt: number;
  readonly id: number;
}

// Keyset cursor over the root ordering `(created_at DESC, id DESC)`,
// encoded `"<unixSeconds>_<id>"`. Keyset (not offset) so newly approved
// comments arriving between page loads can't shift the window and dupe or
// skip a root. Unparseable input → null → treated as the first page.
function encodeCursor(createdAt: number, id: number): string {
  return `${String(createdAt)}_${String(id)}`;
}

function decodeCursor(cursor: string | null | undefined): RootCursor | null {
  if (!cursor) return null;
  const match = /^(\d+)_(\d+)$/.exec(cursor);
  if (!match) return null;
  return { createdAt: Number(match[1]), id: Number(match[2]) };
}

// Augment the template-dep registry so themes can declare
// `defineTemplate({ comments: ["current"], render })` and receive a
// `ResolvedThread` for the entry being rendered.
//
// Lives alongside the exported `ResolvedThread` (not the plugin entry) so
// a theme importing the type from `./server` pulls the `comments` dep kind
// into its `TemplateDepRegistry` too.
declare module "plumix/plugin" {
  interface TemplateDepRegistry {
    comments: { slug: string; result: ResolvedThread };
  }
}

type CommentValue = Omit<ResolvedComment, "replies">;

interface CommentRow {
  readonly id: number;
  readonly parent_id: number | null;
  readonly author_user_id: number | null;
  readonly author_name: string;
  readonly author_email: string;
  readonly body_md: string;
  // Unix seconds: the raw CTE bypasses drizzle's timestamp codec, so this
  // is the stored integer — hence the `* 1000` when building the Date.
  readonly created_at: number;
}

function toResolved(node: ThreadNode<CommentValue>): ResolvedComment {
  return { ...node.value, replies: node.replies.map(toResolved) };
}

/** Count every approved comment in the displayed tree — depth-bounded and
 * orphan-excluded the same way `loadThread` renders it — so the count is
 * stable across pages and matches what's actually shown. */
async function countThread(
  ctx: AppContext,
  entryId: number,
  maxDepth: number,
): Promise<number> {
  const [row] = await ctx.db.all<{ c: number }>(sql`
    WITH RECURSIVE thread AS (
      SELECT id, created_at, 0 AS depth
      FROM comments
      WHERE entry_id = ${entryId} AND status = 'approved' AND parent_id IS NULL
      UNION ALL
      SELECT c.id, c.created_at, t.depth + 1
      FROM comments c
      JOIN thread t ON c.parent_id = t.id
      WHERE c.status = 'approved' AND t.depth + 1 <= ${maxDepth}
    )
    SELECT count(*) AS c FROM thread
  `);
  return row?.c ?? 0;
}

/**
 * Load one page of the approved thread for an entry, rendered for display.
 * Roots paginate newest-first at `rootsPerPage` via a keyset cursor; each
 * root's descendants down to `maxDepth` come with it. Two indexed queries
 * (the root page, then a recursive CTE descending the page's roots) plus a
 * count — no N+1 regardless of page size. A reply whose parent isn't
 * approved is excluded (the CTE only descends approved rows), not
 * promoted; replies stay chronological within each sibling group.
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
  const rows = await ctx.db.all<CommentRow>(sql`
    WITH RECURSIVE thread AS (
      SELECT id, parent_id, author_user_id, author_name, author_email,
             body_md, created_at, 0 AS depth
      FROM comments
      WHERE id IN (${sql.join(
        rootIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      UNION ALL
      SELECT c.id, c.parent_id, c.author_user_id, c.author_name,
             c.author_email, c.body_md, c.created_at, t.depth + 1
      FROM comments c
      JOIN thread t ON c.parent_id = t.id
      WHERE c.status = 'approved' AND t.depth + 1 <= ${maxDepth}
    )
    SELECT id, parent_id, author_user_id, author_name, author_email,
           body_md, created_at
    FROM thread
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
