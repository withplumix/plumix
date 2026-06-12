import type { AppContext } from "plumix/plugin";
import { and, count, eq } from "drizzle-orm";

import type { Comment, NewComment } from "../db/schema.js";
import { comments } from "../db/schema.js";

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
