import type { AppContext } from "plumix/plugin";
import { eq } from "drizzle-orm";
import { entries, jsonResponse } from "plumix/plugin";

import type { ResolvedCommentsConfig } from "../config.js";
import { isCommentingEnabled } from "./enablement.js";
import { loadThread } from "./load-thread.js";

/**
 * The public "load more roots" handler, mounted at
 * `GET /_plumix/comments/list?entryId=<n>&cursor=<token>`
 * (`auth: "public"`). Returns the next page of root comments — each with
 * its descendants — in the same email/IP-private shape the SSR thread
 * uses, so the client can append them. `cursor` is the opaque
 * `nextCursor` from the prior page (or the SSR thread for page two);
 * omit it to re-fetch the first page. Gates the entry the same way the
 * submit route does: must be a published, comment-enabled entry.
 */
export function createListHandler(config: ResolvedCommentsConfig) {
  return async (request: Request, ctx: AppContext): Promise<Response> => {
    const url = new URL(request.url);
    const entryIdRaw = url.searchParams.get("entryId");
    const entryId = Number(entryIdRaw);
    if (entryIdRaw === null || !Number.isInteger(entryId) || entryId < 1) {
      return jsonResponse({ error: "invalid_input" }, { status: 400 });
    }

    const [entry] = await ctx.db
      .select({ type: entries.type, status: entries.status })
      .from(entries)
      .where(eq(entries.id, entryId));
    if (entry?.status !== "published") {
      return jsonResponse({ error: "entry_not_found" }, { status: 404 });
    }

    const supports = ctx.plugins.entryTypes.get(entry.type)?.supports;
    if (!isCommentingEnabled(entry.type, supports, config)) {
      return jsonResponse({ error: "comments_disabled" }, { status: 403 });
    }
    // Mirrors the submit route's published + enablement gates, but
    // deliberately omits its `closeAfterDays` check: a closed thread is
    // read-only, not invisible — you can still page through old comments
    // you can no longer reply to.

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
