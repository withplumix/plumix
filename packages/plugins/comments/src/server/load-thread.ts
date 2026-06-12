import type { AppContext } from "plumix/plugin";
import { and, asc, eq } from "drizzle-orm";

import { comments } from "../db/schema.js";
import { gravatarUrl } from "./gravatar.js";
import { renderCommentBody } from "./render-body.js";

/**
 * A comment as exposed to the public theme. Deliberately omits
 * `authorEmail` and `ipHash` — those stay server-side. `isRegistered`
 * is the only signal of the author's account status (a verified badge);
 * `bodyHtml` is the rendered, sanitized markdown.
 */
export interface ResolvedComment {
  readonly id: number;
  readonly authorName: string;
  readonly isRegistered: boolean;
  readonly avatarUrl: string;
  readonly bodyHtml: string;
  readonly createdAt: Date;
}

/** The assembled comment thread for one entry. */
export interface ResolvedThread {
  readonly entryId: number;
  readonly comments: readonly ResolvedComment[];
  readonly count: number;
}

// Lives alongside the exported `ResolvedThread` (not the plugin entry) so
// a theme importing the type from `./server` pulls the `comments` dep kind
// into its `TemplateDepRegistry` too.
declare module "plumix/plugin" {
  interface TemplateDepRegistry {
    comments: { slug: string; result: ResolvedThread };
  }
}

/**
 * Load the approved comments for an entry, rendered for display. Flat
 * and chronological for the read-path slice; threading (#962) and root
 * pagination (#967) build on this. One indexed query, then per-comment
 * markdown render + avatar hashing in parallel — no N+1.
 */
export async function loadThread(
  ctx: AppContext,
  entryId: number,
): Promise<ResolvedThread> {
  const rows = await ctx.db
    .select()
    .from(comments)
    .where(and(eq(comments.entryId, entryId), eq(comments.status, "approved")))
    .orderBy(asc(comments.createdAt), asc(comments.id));

  const resolved = await Promise.all(
    rows.map(
      async (row): Promise<ResolvedComment> => ({
        id: row.id,
        authorName: row.authorName,
        isRegistered: row.authorUserId !== null,
        avatarUrl: await gravatarUrl(row.authorEmail),
        bodyHtml: renderCommentBody(row.bodyMd),
        createdAt: row.createdAt,
      }),
    ),
  );

  return { entryId, comments: resolved, count: resolved.length };
}
