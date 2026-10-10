import { findEntryTypeByName } from "@/lib/manifest.js";
import {
  entryTypeLabel,
  GENERIC_ENTRY_TYPE_LABELS,
} from "@/lib/type-labels.js";
import { useLabel } from "@/lib/use-label.js";

/**
 * Uses the entry type's `labels.untitledItem` when `targetType` names one, else
 * a generic.
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
