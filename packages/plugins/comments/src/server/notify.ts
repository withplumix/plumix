import type { AppContext } from "plumix/plugin";

import type { Comment } from "../db/schema.js";

/**
 * A no-op unless the comment is `pending` and a mailer is configured, so
 * callers can fire it unconditionally on every new comment.
 */
export async function notifyModeratorOfPending(
  ctx: AppContext,
  comment: Comment,
  recipient: string,
): Promise<void> {
  if (comment.status !== "pending" || !ctx.mailer) return;
  await ctx.mailer.send({
    to: recipient,
    subject: "A comment is awaiting moderation",
    text: `${comment.authorName} left a comment that's held for review:\n\n${comment.bodyMd}`,
  });
}
