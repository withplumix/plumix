import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import { labelSourceText } from "plumix/i18n";

import type { FieldLabelSnapshot, FormLabelSnapshot } from "../types.js";

/**
 * What each field and option was called, captured at submit time. Stored
 * beside the answers so the row stays readable after the form is renamed
 * or removed — the inbox reads the row's own copy, never the live form.
 *
 * Descriptors flatten to their source message rather than the visitor's
 * locale: the snapshot exists for whoever reads the inbox, and the inbox
 * is one place while visitors are many.
 */
export function buildLabelSnapshot(
  fields: readonly MetaBoxFieldManifestEntry[],
): FormLabelSnapshot {
  const snapshot: Record<string, FieldLabelSnapshot> = {};
  for (const field of fields) {
    const label = labelSourceText(field.label);
    snapshot[field.key] = field.options
      ? {
          label,
          options: Object.fromEntries(
            field.options.map((option) => [
              option.value,
              labelSourceText(option.label),
            ]),
          ),
        }
      : { label };
  }
  return snapshot;
}
