import type { PageFacts } from "plumix";

import type { SeoSettings } from "./settings.js";
import { SeoError } from "./errors.js";
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
  | "view"
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
 * The site's install-time policy the chain reads beside its stored settings.
 * `indexViews` names the views (`registerView`) the site offers to search
 * engines; every other view is held out.
 */
export interface IndexabilityPolicy {
  readonly indexViews: ReadonlySet<string>;
}

const NO_POLICY: IndexabilityPolicy = { indexViews: new Set() };

/**
 * Fail the boot on an `indexViews` name no view has, so a misspelt or
 * uninstalled one cannot leave its page silently `noindex`.
 *
 * @throws naming the first such view.
 */
export function assertIndexViewsNameViews(
  indexViews: ReadonlySet<string>,
  views: ReadonlyMap<string, unknown>,
): void {
  for (const view of indexViews) {
    if (!views.has(view)) throw SeoError.unknownIndexView({ view });
  }
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
 * — the site and per-scope arms in `scopeIsOffered`, the entry arm as a `WHERE`
 * — and IndexNow asks the entry-facing ones inline, so what they share is this
 * module's keys and this order, not a call. The agreement table in
 * `routes.test.ts` is what holds the three to one answer. An entry type's
 * `access` policy sits outside all of this: it has no key here, and it gates
 * the page itself, so the head is only ever rendered behind it — only the
 * sitemap and IndexNow have to ask (`isCrawlableType`). The arms below
 * `taxonomy_default` describe pages the sitemap never lists, so there is
 * nothing for them to disagree about.
 */
export function indexable(
  facts: PageFacts,
  settings: SeoSettings,
  policy: IndexabilityPolicy = NO_POLICY,
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
  // An app page is usually per-visitor — a form, an account — so it is out
  // unless the site named it.
  if (
    facts.kind === "view" &&
    (facts.view === null || !policy.indexViews.has(facts.view))
  ) {
    return out("view");
  }
  // Page two of an archive duplicates its first page's purpose without adding
  // a subject of its own.
  if (facts.page > 1 && !settings.indexPaginated) return out("paginated");
  if (facts.kind === "error" && !settings.indexNotFound) {
    return out("not_found");
  }
  return { indexable: true, reason: "default" };
}
