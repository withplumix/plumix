import type { AppContext } from "plumix/plugin";
import { eq } from "drizzle-orm";
import { entries } from "plumix/schema";

import type { ResolvedCommentsConfig } from "../config.js";
import type { ResolvedThread } from "./load-thread.js";
import { isCommentingEnabled } from "./enablement.js";
import { loadThread } from "./load-thread.js";

/**
 * Build the `comments` template-dep loader for a given plugin config.
 * The loader reads the entry being rendered from `ctx.resolvedEntity`
 * (set by the single-route resolver before deps load), confirms
 * commenting is enabled for that entry's type, and returns the approved
 * thread keyed by each declared slug. Returns `{}` (→ `null` per slug)
 * for non-entry routes or comment-disabled types.
 */
export function createCommentsThreadLoader(config: ResolvedCommentsConfig) {
  return async (
    slugs: readonly string[],
    ctx: AppContext,
  ): Promise<Record<string, ResolvedThread | null>> => {
    const resolved = ctx.resolvedEntity;
    if (resolved?.kind !== "entry") return {};

    const [row] = await ctx.db
      .select({ type: entries.type })
      .from(entries)
      .where(eq(entries.id, resolved.id));
    if (!row) return {};

    const supports = ctx.plugins.entryTypes.get(row.type)?.supports;
    if (!isCommentingEnabled(row.type, supports, config)) return {};

    const thread = await loadThread(ctx, resolved.id, config.maxDepth);
    return Object.fromEntries(slugs.map((slug) => [slug, thread]));
  };
}
