import type { MetaBoxField } from "../manifest.js";
import { PluginContextError } from "../errors.js";

// Must match the RPC input-schema regex for meta keys — any key that
// doesn't match is dead code (the write path rejects it), so catch it
// at registration instead of letting the admin discover it later.
export const META_FIELD_KEY_RE = /^[a-zA-Z0-9_:-]+$/;

// Cap on fields per box — keeps the admin's per-request payload
// bounded and signals a modeling problem if a plugin wants to pile
// hundreds of fields into one card. Matches the RPC input-schema cap
// on the meta/upsert request surface.
export const MAX_FIELDS_PER_META_BOX = 200;

export function assertMetaBoxFields(
  kind: string,
  id: string,
  fields: readonly MetaBoxField[],
): void {
  if (fields.length > MAX_FIELDS_PER_META_BOX) {
    throw PluginContextError.metaBoxTooManyFields({
      kind,
      id,
      count: fields.length,
      maxFields: MAX_FIELDS_PER_META_BOX,
    });
  }
  const seen = new Set<string>();
  for (const field of fields) {
    if (!META_FIELD_KEY_RE.test(field.key)) {
      throw PluginContextError.metaBoxFieldInvalidKey({
        kind,
        id,
        fieldKey: field.key,
        pattern: META_FIELD_KEY_RE.source,
      });
    }
    if (seen.has(field.key)) {
      throw PluginContextError.metaBoxFieldDuplicateKey({
        kind,
        id,
        fieldKey: field.key,
      });
    }
    seen.add(field.key);
  }
}
