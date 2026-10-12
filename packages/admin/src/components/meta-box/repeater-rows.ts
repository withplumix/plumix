import type { ResolvedMeta } from "@plumix/core";
import type { Label } from "@plumix/core/i18n";
import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { isFieldVisible, startingMeta } from "@plumix/core/manifest";

/**
 * Malformed rows drop from display; the validator still rejects them on save.
 */
export function repeaterRows(raw: unknown): readonly ResolvedMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is ResolvedMeta =>
      typeof r === "object" && r !== null && !Array.isArray(r),
  );
}

export function newRepeaterRow(
  subFields: readonly MetaBoxFieldManifestEntry[],
): ResolvedMeta {
  const blank: Record<string, unknown> = {};
  for (const sf of subFields) blank[sf.key] = null;
  return { ...blank, ...startingMeta(subFields) };
}

export function rowSummary(
  row: ResolvedMeta,
  subFields: readonly MetaBoxFieldManifestEntry[],
  collapsedKey: string | undefined,
  renderLabel: (label: Label) => string,
): string | null {
  // A hidden cell must not label the row: the author cannot open it to see
  // where the summary came from.
  const visible = subFields.filter((sf) => isFieldVisible(sf, row));
  if (collapsedKey !== undefined) {
    const sf = visible.find((f) => f.key === collapsedKey);
    // Hidden in this row: fall through to the scan rather than leave the row
    // unlabelled, since a visible sibling can still name it.
    if (sf) return cellSummary(row[collapsedKey], sf, renderLabel);
  }
  for (const sf of visible) {
    const summary = cellSummary(row[sf.key], sf, renderLabel);
    if (summary !== null) return summary;
  }
  return null;
}

function cellSummary(
  value: unknown,
  field: MetaBoxFieldManifestEntry | undefined,
  renderLabel: (label: Label) => string,
): string | null {
  const raw = primitiveToString(value);
  if (raw === null) return null;
  const option = field?.options?.find((opt) => opt.value === raw);
  return option ? renderLabel(option.label) : raw;
}

/**
 * A stored primitive as a display string, or null when it's absent/blank or
 * a non-primitive (a nested group/repeater/reference).
 */
function primitiveToString(value: unknown): string | null {
  if (typeof value === "string") return value === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}
