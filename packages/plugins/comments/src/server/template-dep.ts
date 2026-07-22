import type { AppContext } from "plumix/plugin";
import { readEntryType } from "plumix";

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

    const type = await readEntryType(ctx, resolved.id);
    if (type === null) return {};

    const supports = ctx.plugins.entryTypes.get(type)?.supports;
    if (!isCommentingEnabled(type, supports, config)) return {};

    // First (newest) page; older roots load via GET /_plumix/comments/list.
    const thread = await loadThread(ctx, resolved.id, {
      maxDepth: config.maxDepth,
      rootsPerPage: config.rootsPerPage,
    });
    return Object.fromEntries(slugs.map((slug) => [slug, thread]));
  };
}
