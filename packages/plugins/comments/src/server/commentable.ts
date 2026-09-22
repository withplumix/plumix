import type { AppContext } from "plumix/plugin";
import { eq } from "drizzle-orm";
import { entryAllowsAnonymousAccess } from "plumix/auth";
import { entries } from "plumix/schema";

import type { ResolvedCommentsConfig } from "../config.js";
import type { CommentRefusalCode } from "../refusals.js";
import { isCommentingEnabled } from "./enablement.js";

/** The entry a comment surface needs to know about, and nothing more. */
interface CommentableEntry {
  readonly id: number;
  readonly type: string;
  readonly publishedAt: Date | null;
}

/** The refusals a commentable lookup can answer with, out of the one table. */
type CommentableRefusal = Extract<
  CommentRefusalCode,
  "entry_not_found" | "comments_disabled"
>;

export type CommentableResult =
  | { readonly ok: true; readonly entry: CommentableEntry }
  | { readonly ok: false; readonly reason: CommentableRefusal };

/**
 * The entry behind a public comment surface, or why it is refused.
 *
 * All three of this plugin's public routes — the thread page, the REST
 * resource and the submit handler — are `auth: "public"`, which core answers
 * ahead of the access gate and without loading a principal. So each has to ask
 * the entry's own policy itself, and asking it in one place is what keeps a
 * fourth route in this plugin from being added without it. It is not a choke
 * point outside the plugin: `loadThread` is exported raw from
 * `@plumix/plugin-comments/server`, and a caller reaching for that answers the
 * access question itself.
 *
 * `entry_not_found` covers the gated case as well as the missing one, on
 * purpose: distinguishing them would tell a stranger which ids exist behind
 * the gate.
 */
export async function resolveCommentableEntry(
  ctx: AppContext,
  entryId: number,
  config: ResolvedCommentsConfig,
): Promise<CommentableResult> {
  // `meta` rides along because the per-entry policy choice is stored in it;
  // which policy applies cannot be known before the row is in hand.
  const [entry] = await ctx.db
    .select({
      id: entries.id,
      type: entries.type,
      status: entries.status,
      publishedAt: entries.publishedAt,
      meta: entries.meta,
    })
    .from(entries)
    .where(eq(entries.id, entryId));
  if (entry?.status !== "published") {
    return { ok: false, reason: "entry_not_found" };
  }
  if (!(await entryAllowsAnonymousAccess(ctx, entry))) {
    return { ok: false, reason: "entry_not_found" };
  }
  const supports = ctx.plugins.entryTypes.get(entry.type)?.supports;
  if (!isCommentingEnabled(entry.type, supports, config)) {
    return { ok: false, reason: "comments_disabled" };
  }
  return {
    ok: true,
    entry: { id: entry.id, type: entry.type, publishedAt: entry.publishedAt },
  };
}
