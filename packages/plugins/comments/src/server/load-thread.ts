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
 * comment in the tree; `comments` are the roots (each with nested replies). */
export interface ResolvedThread {
  readonly entryId: number;
  readonly comments: readonly ResolvedComment[];
  readonly count: number;
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

/**
 * Load the approved thread for an entry, rendered for display. One
 * recursive CTE walks roots → descendants down to `maxDepth` (the depth
 * bound is a safety net; the submit path already clamps stored depth);
 * the rows render in parallel (no N+1) and `assembleThread` nests them.
 * A reply whose parent isn't approved is excluded (the CTE only descends
 * through approved rows), not promoted. Chronological within each sibling
 * group; root pagination + ordering are a later slice.
 */
export async function loadThread(
  ctx: AppContext,
  entryId: number,
  maxDepth: number,
): Promise<ResolvedThread> {
  const rows = await ctx.db.all<CommentRow>(sql`
    WITH RECURSIVE thread AS (
      SELECT id, parent_id, author_user_id, author_name, author_email,
             body_md, created_at, 0 AS depth
      FROM comments
      WHERE entry_id = ${entryId} AND status = 'approved' AND parent_id IS NULL
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

  return {
    entryId,
    comments: assembleThread(inputs).map(toResolved),
    count: rows.length,
  };
}
