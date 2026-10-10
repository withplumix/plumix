import type { PageFacts } from "plumix";

import type { SeoSettings } from "./settings.js";
import { SeoError } from "./errors.js";
import { readPageOverrides } from "./overrides.js";
import { scopedType } from "./scope.js";

/** In evaluation order. `default` means no assertion fired. */
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
 * Short-circuits on the first assertion that fires, so a private site can't be
 * overridden by an entry and an entry's answer outranks its type's default.
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
  // A page that answers a visitor's query, whichever payload rendered it:
  // core's search page states the query, and so does a plugin archive that
  // replaces it.
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
