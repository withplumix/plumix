import type { Label } from "@plumix/core/i18n";
import type {
  EntryTypeLabels,
  EntryTypeManifestEntry,
  TermTaxonomyLabels,
  TermTaxonomyManifestEntry,
} from "@plumix/core/manifest";
import {
  GENERIC_ENTRY_TYPE_LABELS,
  GENERIC_TERM_TAXONOMY_LABELS,
} from "@plumix/core/i18n";

// Generic noun-less descriptors come from `@plumix/core/i18n` so the
// admin and the manifest builder agree on the cascade fallback set.
// Re-exported here for ergonomic admin imports; the canonical home is
// core, since plugin code reads the same tables.
export { GENERIC_ENTRY_TYPE_LABELS, GENERIC_TERM_TAXONOMY_LABELS };

/**
 * Resolve a chrome label for an entry type with the WP-style cascade:
 * the plugin-declared `labels[key]` when present, the generic
 * noun-less descriptor from `GENERIC_ENTRY_TYPE_LABELS` otherwise.
 * No third `fallback` param — the per-key generic is the canonical
 * fallback for every consumer. Mirrors WP's `get_post_type_labels()`
 * resolution except plumix never substitutes the type's noun into
 * a sentence (DE/RU/PL/UK/AR morphology) or lowercases a translated
 * noun.
 */
export function entryTypeLabel<K extends keyof EntryTypeLabels>(
  entry: EntryTypeManifestEntry,
  key: K,
): Label {
  return entry.labels?.[key] ?? GENERIC_ENTRY_TYPE_LABELS[key];
}

/** Term-taxonomy counterpart of `entryTypeLabel`. */
export function termTaxonomyLabel<K extends keyof TermTaxonomyLabels>(
  taxonomy: TermTaxonomyManifestEntry,
  key: K,
): Label {
  return taxonomy.labels?.[key] ?? GENERIC_TERM_TAXONOMY_LABELS[key];
}

/**
 * Undefined-tolerant variant of `termTaxonomyLabel` for call sites
 * that resolve the taxonomy lazily (e.g. HMR boundary, dynamic
 * taxonomy name from a URL segment). Returns the generic descriptor
 * when the taxonomy isn't known — matches WP's
 * `get_taxonomy_labels( null )` semantics.
 */
export function termTaxonomyLabelOr<K extends keyof TermTaxonomyLabels>(
  taxonomy: TermTaxonomyManifestEntry | undefined,
  key: K,
): Label {
  return taxonomy?.labels?.[key] ?? GENERIC_TERM_TAXONOMY_LABELS[key];
}
