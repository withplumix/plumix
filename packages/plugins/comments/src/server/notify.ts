import type { AppContext } from "plumix/plugin";
import { eq } from "drizzle-orm";
import { MailerNotConfigured } from "plumix/plugin";
import { entries } from "plumix/schema";
import { withBasePath } from "plumix/support";

import type { Comment } from "../db/schema.js";

/**
 * A no-op for non-`pending` comments and without a mailer, so callers fire it
 * on every new comment.
 */
export async function notifyModeratorOfPending(
  ctx: Pick<AppContext, "db" | "mail" | "mailer" | "origin" | "config">,
  comment: Comment,
  recipient: string,
): Promise<void> {
  if (comment.status !== "pending" || !ctx.mailer) return;
  const entry = await ctx.db.query.entries.findFirst({
    columns: { id: true, type: true, title: true, slug: true },
    where: eq(entries.id, comment.entryId),
  });
  // The entry was deleted under the comment, which went with it.
  if (!entry) return;
  const moderationUrl = new URL(
    withBasePath("/_plumix/admin/pages/comments", ctx.config.basePath),
    ctx.origin,
  ).href;
  try {
    await ctx.mail.send(
      "commentAwaitingModeration",
      { comment, entry, moderationUrl },
      { to: recipient },
    );
  } catch (error) {
    if (error instanceof MailerNotConfigured) return;
    throw error;
  }
}
