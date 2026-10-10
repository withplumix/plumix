import type { TemplateDepLoader } from "plumix";
import { readEntryType } from "plumix/plugin";

import type { ResolvedCommentsConfig } from "../config.js";
import { isCommentingEnabled } from "./enablement.js";
import { loadThread } from "./load-thread.js";

/**
 * Returns `{}` (each slug `null`) on non-entry routes and comment-disabled
 * types.
 */
export function createCommentsThreadLoader(
  config: ResolvedCommentsConfig,
): TemplateDepLoader<"comments"> {
  return async ({ slugs }, ctx) => {
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
