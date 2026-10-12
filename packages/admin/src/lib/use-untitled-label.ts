import { currentManifest, findEntryTypeByName } from "@/lib/manifest.js";
import {
  entryTypeLabel,
  GENERIC_ENTRY_TYPE_LABELS,
} from "@/lib/type-labels.js";
import { useLabel } from "@/lib/use-label.js";

import type { Label } from "@plumix/core/i18n";
import type { PlumixManifest } from "@plumix/core/manifest";

/**
 * Uses the entry type's `labels.untitledItem` when `targetType` names one, else
 * a generic.
 */
export function useUntitledLabel(): (
  value: string | null,
  targetType?: string,
) => string {
  const renderLabel = useLabel();
  return (value, targetType) => renderLabel(untitledLabel(value, targetType));
}

/** `value` itself when set, else the untitled label `useUntitledLabel` renders. */
export function untitledLabel(
  value: string | null,
  targetType: string | undefined,
  source: PlumixManifest = currentManifest(),
): Label {
  if (value !== null) return value;
  if (targetType !== undefined) {
    const entryType = findEntryTypeByName(targetType, source);
    if (entryType) return entryTypeLabel(entryType, "untitledItem");
  }
  return GENERIC_ENTRY_TYPE_LABELS.untitledItem;
}
