import { findEntryTypeByName } from "@/lib/manifest.js";
import {
  entryTypeLabel,
  GENERIC_ENTRY_TYPE_LABELS,
} from "@/lib/type-labels.js";
import { useLabel } from "@/lib/use-label.js";

/**
 * Resolve a localized "Untitled" label for a `LookupResult` row whose
 * server-supplied label is `null`. When `targetType` resolves to a
 * registered entry type, the cascade picks up `labels.untitledItem`
 * from the manifest; otherwise (term taxonomies, unknown types,
 * `targetType` omitted) the noun-less generic descriptor fills in.
 *
 * Returns a stable resolver function `(value, targetType) => string`
 * so consumers can render labels for many list rows from a single
 * hook call without per-row React tree allocations.
 */
export function useUntitledLabel(): (
  value: string | null,
  targetType?: string,
) => string {
  const renderLabel = useLabel();
  return (value, targetType) => {
    if (value !== null) return value;
    if (targetType !== undefined) {
      const entryType = findEntryTypeByName(targetType);
      if (entryType) {
        return renderLabel(entryTypeLabel(entryType, "untitledItem"));
      }
    }
    return renderLabel(GENERIC_ENTRY_TYPE_LABELS.untitledItem);
  };
}
