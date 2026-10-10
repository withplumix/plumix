import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import { labelSourceText } from "plumix/i18n";

import type { FieldLabelSnapshot, FormLabelSnapshot } from "../types.js";
import { toHex } from "./secret.js";

/**
 * Labels use the source message, not the visitor's locale: the snapshot is
 * for the inbox reader.
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

/** Field order matters: the same questions reordered digest differently. */
export async function labelSnapshotDigest(
  labels: FormLabelSnapshot,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    ENCODER.encode(JSON.stringify(labels)),
  );
  return toHex(new Uint8Array(digest));
}
