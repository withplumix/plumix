import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import { labelSourceText } from "plumix/i18n";

import type { FieldLabelSnapshot, FormLabelSnapshot } from "../types.js";
import { toHex } from "./secret.js";

/**
 * What each field and option was called, captured at submit time. Stored
 * once per distinct snapshot and pointed at by every submission it
 * describes, so a row stays readable after the form is renamed or
 * removed — the inbox reads the snapshot, never the live form.
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

const ENCODER = new TextEncoder();

/**
 * The key one snapshot is stored under: SHA-256 of its own JSON, hex.
 * Content-addressed rather than allocated, so the same labels reached
 * twice — the next submission to the same form, or a different form
 * whose fields happen to be named identically — resolve to the row that
 * is already there without a lookup first.
 *
 * `buildLabelSnapshot` walks the form's fields in declaration order and
 * this hashes what it built, so two identical forms serialise
 * identically. Two that ask the same questions in a different order do
 * not, and each keeps a snapshot of its own.
 */
export async function labelSnapshotDigest(
  labels: FormLabelSnapshot,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    ENCODER.encode(JSON.stringify(labels)),
  );
  return toHex(new Uint8Array(digest));
}
