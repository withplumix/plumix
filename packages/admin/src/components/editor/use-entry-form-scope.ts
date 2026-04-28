import { useMemo } from "react";
import {
  entryMetaBoxesForType,
  visibleTermTaxonomies,
} from "@/lib/manifest.js";

import type {
  EntryMetaBoxManifestEntry,
  EntryTypeManifestEntry,
  TermTaxonomyManifestEntry,
} from "@plumix/core/manifest";

export interface EntryFormScope {
  readonly metaBoxes: readonly EntryMetaBoxManifestEntry[];
  readonly taxonomies: readonly TermTaxonomyManifestEntry[];
}

/**
 * The two editor routes (create + edit) both filter the registered
 * meta boxes and taxonomies down to what's allowed for the current
 * entry type and the viewer's capabilities. Shared here so the two
 * derivations can't drift.
 */
export function useEntryFormScope(
  entryType: EntryTypeManifestEntry,
  capabilities: readonly string[],
): EntryFormScope {
  const metaBoxes = useMemo(
    () => entryMetaBoxesForType(entryType.name, capabilities),
    [entryType.name, capabilities],
  );
  const taxonomies = useMemo(() => {
    const allowed = new Set(entryType.termTaxonomies ?? []);
    return visibleTermTaxonomies(capabilities).filter((t) =>
      allowed.has(t.name),
    );
  }, [entryType.termTaxonomies, capabilities]);
  return { metaBoxes, taxonomies };
}
