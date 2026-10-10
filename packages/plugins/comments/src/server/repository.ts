import type { SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { AppContext } from "plumix/plugin";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { escapeLikePattern } from "plumix/support";

import type { Comment, NewComment } from "../db/schema.js";
import type { CommentStatus } from "../types.js";
import { comments } from "../db/schema.js";
import { COMMENT_STATUSES } from "../types.js";

/**
 * Independent of maxDepth so true depth is measured even after maxDepth was
 * lowered; otherwise a reply could escape the cap. Doubles as a cycle guard.
 */
const MAX_ANCESTOR_WALK = 1000;

/**
 * Replying at the cap re-parents to the deepest in-cap ancestor. Null (a root)
 * when the parent is missing or on another entry.
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

  // chain is child-first; the requested parent is at depth chain.length - 1.
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

/**
 * A comment as the moderation queue sees it — unlike the public payload
 * this keeps `authorEmail`, `ipHash`, and `userAgent`, the context a
 * moderator needs.
 */
export interface ModerationComment {
  readonly id: number;
  readonly entryId: number;
  readonly parentId: number | null;
  readonly status: CommentStatus;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly bodyMd: string;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

function toModeration(row: Comment): ModerationComment {
  return {
    id: row.id,
    entryId: row.entryId,
    parentId: row.parentId,
    status: row.status,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    bodyMd: row.bodyMd,
    ipHash: row.ipHash,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

/**
 * LIKE pattern matching `term` anywhere, with the SQL wildcards escaped so
 * a literal `%` or `_` in the search box isn't treated as a wildcard.
 */
function likeContains(column: AnySQLiteColumn, term: string): SQL {
  return sql`${column} LIKE ${`%${escapeLikePattern(term)}%`} ESCAPE '\\'`;
}

/**
 * One status tab of the moderation queue, newest-first, paginated.
 * Optionally narrowed to one entry and/or a free-text search over the
 * author name, email, and body.
 */
export async function listForModeration(
  ctx: AppContext,
  opts: {
    status: CommentStatus;
    limit: number;
    offset: number;
    entryId?: number;
    search?: string;
  },
): Promise<ModerationComment[]> {
  const conditions: SQL[] = [eq(comments.status, opts.status)];
  if (opts.entryId !== undefined) {
    conditions.push(eq(comments.entryId, opts.entryId));
  }
  const term = opts.search?.trim();
  if (term) {
    const match = or(
      likeContains(comments.authorName, term),
      likeContains(comments.authorEmail, term),
      likeContains(comments.bodyMd, term),
    );
    if (match) conditions.push(match);
  }

  const rows = await ctx.db
    .select()
    .from(comments)
    .where(and(...conditions))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(opts.limit)
    .offset(opts.offset);
  return rows.map(toModeration);
}

/** Apply a status to many comments at once (bulk moderation). Returns the
 * updated rows so the caller can fire per-comment lifecycle actions. */
export async function setStatusMany(
  ctx: AppContext,
  ids: readonly number[],
  status: CommentStatus,
): Promise<Comment[]> {
  if (ids.length === 0) return [];
  return ctx.db
    .update(comments)
    .set({ status })
    .where(inArray(comments.id, [...ids]))
    .returning();
}

/** Comment counts per status, for the queue's tab badges. */
export async function countByStatus(
  ctx: AppContext,
): Promise<Record<CommentStatus, number>> {
  const rows = await ctx.db
    .select({ status: comments.status, value: count() })
    .from(comments)
    .groupBy(comments.status);
  const tally = Object.fromEntries(
    COMMENT_STATUSES.map((status) => [status, 0]),
  ) as Record<CommentStatus, number>;
  for (const row of rows) tally[row.status] = row.value;
  return tally;
}

/** Transition a comment to a new status. */
export async function setStatus(
  ctx: AppContext,
  id: number,
  status: CommentStatus,
): Promise<Comment | null> {
  const [row] = await ctx.db
    .update(comments)
    .set({ status })
    .where(eq(comments.id, id))
    .returning();
  return row ?? null;
}

type RemovalOutcome =
  | { readonly result: "tombstoned" | "deleted"; readonly comment: Comment }
  | { readonly result: "missing" };

/**
 * Hard-remove a comment. A comment with replies is tombstoned (body and
 * author identity blanked, node kept) so the thread structure survives; a
 * leaf is deleted outright.
 */
export async function purgeComment(
  ctx: AppContext,
  id: number,
): Promise<RemovalOutcome> {
  const [comment] = await ctx.db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  if (!comment) return { result: "missing" };

  const [child] = await ctx.db
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.parentId, id))
    .limit(1);

  if (child) {
    const [row] = await ctx.db
      .update(comments)
      .set({
        bodyMd: "",
        authorName: "[deleted]",
        authorEmail: "",
        ipHash: null,
        userAgent: null,
      })
      .where(eq(comments.id, id))
      .returning({ id: comments.id });
    return row ? { result: "tombstoned", comment } : { result: "missing" };
  }

  const deleted = await ctx.db
    .delete(comments)
    .where(eq(comments.id, id))
    .returning({ id: comments.id });
  return deleted.length > 0
    ? { result: "deleted", comment }
    : { result: "missing" };
}
