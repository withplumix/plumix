import type { PageFacts } from "plumix";

import type { SeoSettings } from "./settings.js";
import { readPageOverrides } from "./overrides.js";
import { scopedType } from "./scope.js";

/**
 * Why a page is or is not offered to a search engine, in the order the
 * assertions are evaluated. `default` is nothing having fired.
 *
 * The reason travels with the decision so an editor can be told a page is out
 * because its whole type is, rather than being shown a toggle that looks like
 * it did nothing.
 */
export type IndexabilityReason =
  | "site_private"
  | "entry_override"
  | "type_default"
  | "taxonomy_default"
  | "search_results"
  | "paginated"
  | "not_found"
  | "default";

export interface Indexability {
  readonly indexable: boolean;
  readonly reason: IndexabilityReason;
}

function out(reason: IndexabilityReason): Indexability {
  return { indexable: false, reason };
}

/**
 * Whether this page is offered to search engines, and why.
 *
 * An ordered set of named assertions, short-circuiting on the first that
 * fires. Order is the design: a site held out of the index cannot be
 * overridden back in by an entry, and an editor's answer for one entry
 * outranks the default set for its whole type.
 *
 * The sitemap answers the same questions of whole tables rather than of a page
 * — the site and per-scope arms in `routes.ts`, the entry arm as a `WHERE` in
 * `sitemap.ts` — so what they share is this module's keys and this order, not
 * a call. The arms below `taxonomy_default` describe pages the sitemap never
 * lists, so there is nothing for them to disagree about.
 */
export function indexable(
  facts: PageFacts,
  settings: SeoSettings,
): Indexability {
  if (!settings.indexable) return out("site_private");
  if (readPageOverrides(facts).noindex) return out("entry_override");
  const entryType = scopedType(facts);
  if (entryType !== null && settings.noindexTypes.has(entryType)) {
    return out("type_default");
  }
  const taxonomy = facts.term?.taxonomy;
  if (taxonomy !== undefined && settings.noindexTaxonomies.has(taxonomy)) {
    return out("taxonomy_default");
  }
  // A page that answers a visitor's query, whichever payload rendered it: core's
  // search page states the query, and so does a plugin archive that replaces it.
  if (facts.query !== null && !settings.indexSearch) {
    return out("search_results");
  }
  // Page two of an archive duplicates its first page's purpose without adding
  // a subject of its own.
  if (facts.page > 1 && !settings.indexPaginated) return out("paginated");
  if (facts.kind === "error" && !settings.indexNotFound) {
    return out("not_found");
  }
  return { indexable: true, reason: "default" };
}
