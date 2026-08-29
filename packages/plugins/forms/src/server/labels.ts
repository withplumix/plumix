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
 *
 * A composite field — a repeater's row, a group's members — carries its
 * own fields under `fields`, so a stored row nests exactly as the form
 * asked and {@link formatSubmission} can name every answer inside one.
 */
export function buildLabelSnapshot(
  fields: readonly MetaBoxFieldManifestEntry[],
): FormLabelSnapshot {
  const snapshot: Record<string, FieldLabelSnapshot> = {};
  for (const field of fields) {
    const label = labelSourceText(field.label);
    const options = field.options && {
      options: Object.fromEntries(
        field.options.map((option) => [
          option.value,
          labelSourceText(option.label),
        ]),
      ),
    };
    const subFields = field.subFields && {
      fields: buildLabelSnapshot(field.subFields),
    };
    snapshot[field.key] = { label, ...options, ...subFields };
  }
  return snapshot;
}
