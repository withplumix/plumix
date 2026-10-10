import type { AppContext } from "plumix/plugin";
import { jsonResponse } from "plumix/plugin";

import type { ResolvedCommentsConfig } from "../config.js";
import { REFUSALS } from "../refusals.js";
import { resolveCommentableEntry } from "./commentable.js";
import { loadThread } from "./load-thread.js";

/**
 * Omit `cursor` to re-fetch the first page. Gates the entry exactly as the
 * submit route does.
 */
export function createListHandler(config: ResolvedCommentsConfig) {
  return async (request: Request, ctx: AppContext): Promise<Response> => {
    const url = new URL(request.url);
    const entryIdRaw = url.searchParams.get("entryId");
    const entryId = Number(entryIdRaw);
    if (entryIdRaw === null || !Number.isInteger(entryId) || entryId < 1) {
      return jsonResponse({ error: "invalid_input" }, { status: 400 });
    }

    // Deliberately without the submit route's `closeAfterDays` check: a
    // closed thread is read-only, not invisible — you can still page through
    // old comments you can no longer reply to.
    const resolved = await resolveCommentableEntry(ctx, entryId, config);
    if (!resolved.ok) {
      return jsonResponse(
        { error: resolved.reason },
        { status: REFUSALS[resolved.reason].status },
      );
    }

    const thread = await loadThread(ctx, entryId, {
      maxDepth: config.maxDepth,
      rootsPerPage: config.rootsPerPage,
      cursor: url.searchParams.get("cursor"),
    });
    return jsonResponse({
      comments: thread.comments,
      hasMore: thread.hasMore,
      nextCursor: thread.nextCursor,
    });
  };
}
