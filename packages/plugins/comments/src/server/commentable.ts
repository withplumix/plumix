import type { AppContext } from "plumix/plugin";
import { entryAllowsAnonymousAccess } from "plumix/auth";
import { loadAuthoredEntry } from "plumix/db";

import type { ResolvedCommentsConfig } from "../config.js";
import type { CommentRefusalCode } from "../refusals.js";
import { isCommentingEnabled } from "./enablement.js";

interface CommentableEntry {
  readonly id: number;
  readonly type: string;
  readonly publishedAt: Date | null;
}

type CommentableRefusal = Extract<
  CommentRefusalCode,
  "entry_not_found" | "comments_disabled"
>;

export type CommentableResult =
  | { readonly ok: true; readonly entry: CommentableEntry }
  | { readonly ok: false; readonly reason: CommentableRefusal };

/**
 * Public routes skip core's access gate, so each asks the entry's policy here.
 * A gated entry answers `entry_not_found` too, so strangers can't probe ids.
 */
export async function resolveCommentableEntry(
  ctx: AppContext,
  entryId: number,
  config: ResolvedCommentsConfig,
): Promise<CommentableResult> {
  const entry = await loadAuthoredEntry(ctx.db, entryId);
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
