import type { MultiSelectOption } from "@/components/form/multi-select.js";
import { buildTermTree, flattenTree } from "@/components/taxonomy/tree.js";

import type { Term } from "@plumix/core/schema";

/**
 * Narrow a term-id bag (`{ category: [3, 7], tag: [12] }`) to the set
 * of taxonomies registered against the current entry type. Stale keys
 * from a previous entry-type or a hand-edited URL don't make it to
 * `entry.create`/`entry.update` — the server would reject them, but
 * filtering up-front gives a cleaner contract.
 *
 * Empty arrays are dropped; an empty result returns `undefined` so
 * callers can spread it conditionally without sending an empty `terms`
 * field to the server.
 */
export function filterTermsForEntryType(
  bag: Record<string, readonly number[]>,
  allowed: readonly string[] | undefined,
): Record<string, number[]> | undefined {
  if (!allowed || allowed.length === 0) return undefined;
  const allow = new Set(allowed);
  const out: Record<string, number[]> = {};
  for (const [taxonomy, ids] of Object.entries(bag)) {
    if (allow.has(taxonomy) && ids.length > 0) {
      out[taxonomy] = [...ids];
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * `MultiSelectOption[]` for the editor's term picker — values are
 * stringified term ids because the form persists assignments by id.
 * Hierarchical taxonomies render with depth-indented options; flat
 * taxonomies sort alphabetically.
 */
export function buildEditorTermOptions(
  terms: readonly Term[],
  isHierarchical: boolean,
): MultiSelectOption[] {
  if (!isHierarchical) {
    return terms
      .map((term) => ({ value: String(term.id), label: term.name, depth: 0 }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  return flattenTree(buildTermTree(terms)).map(({ term, depth }) => ({
    value: String(term.id),
    label: term.name,
    depth,
  }));
}

/**
 * Like `buildEditorTermOptions`, but values are slugs because the
 * entries-list term filter uses URL search params and slugs are the
 * stable wire identifier for `entry.list.termTaxonomies`.
 */
export function buildFilterTermOptions(
  terms: readonly Term[],
  isHierarchical: boolean,
): MultiSelectOption[] {
  if (!isHierarchical) {
    return terms
      .map((term) => ({ value: term.slug, label: term.name, depth: 0 }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  return flattenTree(buildTermTree(terms)).map(({ term, depth }) => ({
    value: term.slug,
    label: term.name,
    depth,
  }));
}
