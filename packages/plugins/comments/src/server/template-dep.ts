import type { TemplateDepLoader } from "plumix";
import { readEntryType } from "plumix/plugin";
import { redirectTo, withBasePath } from "plumix/support";

import type { ResolvedCommentsConfig } from "../config.js";
import type { ResolvedThreadPage } from "./load-thread.js";
import { COMMENTS_PAGE_PARAM } from "../contract.js";
import { isCommentingEnabled } from "./enablement.js";
import { decodeCursor, loadThread } from "./load-thread.js";

/**
 * The entry page at `cursor`, or the newest page for `null`, keeping the rest
 * of the query. `page` has had the base path stripped.
 */
function threadPageHref(
  page: URL,
  basePath: string,
  cursor: string | null,
): string {
  const query = new URLSearchParams(page.search);
  if (cursor === null) query.delete(COMMENTS_PAGE_PARAM);
  else query.set(COMMENTS_PAGE_PARAM, cursor);
  const search = query.size > 0 ? `?${query.toString()}` : "";
  return `${withBasePath(page.pathname, basePath)}${search}`;
}

/**
 * Returns `{}` (each slug `null`) on non-entry routes and comment-disabled
 * types. A cursor that doesn't decode throws a 301 to the entry, so junk
 * never becomes a cached duplicate.
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

    const page = new URL(ctx.request.url);
    const cursor = page.searchParams.get(COMMENTS_PAGE_PARAM);
    const newestHref = threadPageHref(page, ctx.config.basePath, null);
    if (cursor !== null && decodeCursor(cursor) === null) {
      throw redirectTo(`${ctx.origin}${newestHref}`, 301);
    }

    const thread = await loadThread(ctx, resolved.id, {
      maxDepth: config.maxDepth,
      rootsPerPage: config.rootsPerPage,
      cursor,
    });
    const threadPage: ResolvedThreadPage = {
      ...thread,
      olderHref:
        thread.nextCursor === null
          ? null
          : threadPageHref(page, ctx.config.basePath, thread.nextCursor),
      newestHref: cursor === null ? null : newestHref,
    };
    return Object.fromEntries(slugs.map((slug) => [slug, threadPage]));
  };
}
