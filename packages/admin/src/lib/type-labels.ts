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

export { GENERIC_ENTRY_TYPE_LABELS, GENERIC_TERM_TAXONOMY_LABELS };

/**
 * Falls back to a noun-less generic: substituting the type's noun into a
 * sentence breaks languages with inflection.
 */
export function entryTypeLabel(
  entry: EntryTypeManifestEntry,
  key: keyof EntryTypeLabels,
): Label {
  return entry.labels?.[key] ?? GENERIC_ENTRY_TYPE_LABELS[key];
}

/** Term-taxonomy counterpart of `entryTypeLabel`. */
export function termTaxonomyLabel(
  taxonomy: TermTaxonomyManifestEntry,
  key: keyof TermTaxonomyLabels,
): Label {
  return taxonomy.labels?.[key] ?? GENERIC_TERM_TAXONOMY_LABELS[key];
}

/** Returns the generic descriptor when the taxonomy is unknown. */
export function termTaxonomyLabelOr(
  taxonomy: TermTaxonomyManifestEntry | undefined,
  key: keyof TermTaxonomyLabels,
): Label {
  return taxonomy?.labels?.[key] ?? GENERIC_TERM_TAXONOMY_LABELS[key];
}
