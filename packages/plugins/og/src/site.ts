import type { AppContext } from "plumix/plugin";

import { loadSeoSettings } from "@plumix/plugin-seo";

/**
 * The site-wide `og:image`, absolute, or null where none is set — the last
 * link of the chain, which both the route's fallback redirect and the editor
 * preview end at.
 *
 * The setting holds whatever an operator typed: a full URL, or a path into the
 * site's own media. Resolving it against the origin is what makes it neither
 * ambiguous nor malformed as a `Location` or an `<img src>`; the head emits it
 * as typed, since a scraper resolves it against the page.
 */
export async function siteDefaultImage(
  ctx: AppContext,
): Promise<string | null> {
  const value = (await loadSeoSettings(ctx)).defaultOgImage;
  return value === null ? null : (URL.parse(value, ctx.origin)?.href ?? null);
}
