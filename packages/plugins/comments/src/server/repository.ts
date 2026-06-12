import type { AppContext } from "plumix/plugin";
import { and, count, eq } from "drizzle-orm";

import type { Comment, NewComment } from "../db/schema.js";
import { comments } from "../db/schema.js";

// Absolute walk ceiling, independent of maxDepth, so the true depth is
// measured even if maxDepth was lowered after deep rows were written
// (otherwise the clamp could under-count and let a reply escape the cap).
// Doubles as a cycle guard against (impossible-but-cheap-to-defend) loops.
const MAX_ANCESTOR_WALK = 1000;

/**
 * Resolve the parent a new reply should actually attach to, clamped so the
 * reply never lands deeper than `maxDepth` (root = 0). Replying to a
 * comment already at the cap re-parents to its deepest in-cap ancestor.
 * Returns null (a root comment) when there's no parent, the parent is
 * missing, or it belongs to another entry.
 */
export async function clampParent(
  ctx: AppContext,
  requestedParentId: number | null,
  entryId: number,
  maxDepth: number,
): Promise<number | null> {
  if (requestedParentId === null) return null;

  // Ancestor ids, child-first: [requestedParent, …, root].
  const chain: number[] = [];
  let cursor: number | null = requestedParentId;
  while (cursor !== null && chain.length < MAX_ANCESTOR_WALK) {
    const [row] = await ctx.db
      .select({
        id: comments.id,
        parentId: comments.parentId,
        entryId: comments.entryId,
      })
      .from(comments)
      .where(eq(comments.id, cursor));
    if (!row) break;
    // The requested parent must belong to this entry; ancestors follow.
    if (chain.length === 0 && row.entryId !== entryId) return null;
    chain.push(row.id);
    cursor = row.parentId;
  }
  if (chain.length === 0) return null;

  // The requested parent sits at depth chain.length - 1 (root = 0). Cap the
  // new comment at maxDepth by attaching to the ancestor at maxDepth - 1
  // (or the parent itself when it's already shallower). chain is child-first,
  // so that ancestor is this many entries from the end:
  const requestedDepth = chain.length - 1;
  const targetDepth = Math.min(requestedDepth, maxDepth - 1);
  const indexFromRoot = chain.length - 1 - targetDepth;
  return chain[indexFromRoot] ?? null;
}

/**
 * How many approved comments an email already has — the trust-policy
 * lookup that lets `first_time` moderation auto-approve a returning,
 * previously-approved commenter.
 */
export async function countPriorApproved(
  ctx: AppContext,
  email: string,
): Promise<number> {
  const [row] = await ctx.db
    .select({ value: count() })
    .from(comments)
    .where(
      and(eq(comments.authorEmail, email), eq(comments.status, "approved")),
    );
  return row?.value ?? 0;
}

/** Insert a comment and return the stored row. */
export async function insertComment(
  ctx: AppContext,
  values: NewComment,
): Promise<Comment> {
  const [row] = await ctx.db.insert(comments).values(values).returning();
  if (!row) {
    // eslint-disable-next-line no-restricted-syntax -- unreachable: returning() yields the row
    throw new Error("insertComment: insert returned no row");
  }
  return row;
}
