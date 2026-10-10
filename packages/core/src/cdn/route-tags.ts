import type { AppContext } from "../context/app-context.js";
import { declarePageTags } from "./contract/page-tags.js";

/**
 * Applies to a `cacheable` plugin route and a public page render alike; calls
 * union, and a response that never reaches the CDN ignores them.
 */
export function tagCdnEntry(
  ctx: Pick<AppContext, "cdn" | "memo">,
  tags: readonly string[],
): void {
  if (ctx.cdn === undefined) return;
  declarePageTags(ctx, tags);
}
