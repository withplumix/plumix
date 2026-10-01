import type { AppContext } from "../context/app-context.js";
import { declarePageTags } from "./contract/page-tags.js";

/**
 * Declare the cache tags this request's response should be stored under —
 * `entryTag`/`typeTag` are the vocabulary core purges by, so a card tagged
 * `e:<id>` is cleared by the same publish that clears the entry's page.
 *
 * Reaches whatever response the request produces: a `cacheable: true` plugin
 * route's, stored under the declared tags with no intent tags, and a public
 * page render's, stored under them beside its route's own — so a template-dep
 * loader, a component or a hook that read something can name it. Calling it twice in a request
 * unions the tags; calling it on a response that never reaches the CDN does
 * nothing.
 */
export function tagCdnEntry(
  ctx: Pick<AppContext, "cdn" | "memo">,
  tags: readonly string[],
): void {
  if (ctx.cdn === undefined) return;
  declarePageTags(ctx, tags);
}
