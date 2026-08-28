import type { PageFacts } from "plumix";

import type { SeoSettings } from "./settings.js";
import { readPageOverrides } from "./overrides.js";

/**
 * Why a page is or is not offered to a search engine, in the order the
 * assertions are evaluated. `default` is nothing having fired.
 *
 * The reason travels with the decision so an editor can be told a page is out
 * because the whole site is, rather than being shown a toggle that looks like
 * it did nothing. The per-type, taxonomy, paginated and not-found arms join
 * the chain with the per-type defaults.
 */
export type IndexabilityReason =
  "site_private" | "entry_override" | "search_results" | "default";

export interface Indexability {
  readonly indexable: boolean;
  readonly reason: IndexabilityReason;
}

/**
 * Whether this page is offered to search engines, and why.
 *
 * Short-circuits on the first assertion that fires, so a site held out of the
 * index cannot be overridden back in by an entry.
 *
 * The sitemap answers the same two questions of whole tables rather than of a
 * page — the site arm in `routes.ts`, the entry arm as a `WHERE` in
 * `sitemap.ts` — so what they share is this module's key and this order, not a
 * call. A page cannot be `noindex` in its head and listed in the sitemap
 * because both read `SEO_META_KEYS.noindex`, and nothing else decides either.
 */
export function indexable(
  facts: PageFacts,
  settings: Pick<SeoSettings, "indexable">,
): Indexability {
  if (!settings.indexable) {
    return { indexable: false, reason: "site_private" };
  }
  if (readPageOverrides(facts).noindex) {
    return { indexable: false, reason: "entry_override" };
  }
  if (facts.kind === "search") {
    return { indexable: false, reason: "search_results" };
  }
  return { indexable: true, reason: "default" };
}
