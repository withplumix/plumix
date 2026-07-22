import type { MetaBoxField } from "../manifest.js";
import { PluginContextError } from "../errors.js";

// Must match the RPC input-schema regex for meta keys — any key that
// doesn't match is dead code (the write path rejects it), so catch it
// at registration instead of letting the admin discover it later.
export const META_FIELD_KEY_RE = /^[a-zA-Z0-9_:-]+$/;

// Reserved namespace for core-owned meta keys (e.g. revision snapshot
// envelopes at `__plumix_snapshot`). Rejected at registration so a
// plugin can never shadow a future core key — the matching write
// path would otherwise have to enforce this on every entry.update.
export const META_RESERVED_KEY_PREFIX = "__plumix_";

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
    if (field.key.startsWith(META_RESERVED_KEY_PREFIX)) {
      throw PluginContextError.metaBoxFieldReservedKey({
        kind,
        id,
        fieldKey: field.key,
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
  // Second pass so declaration order doesn't matter — a condition may
  // reference a driver declared later in the same box.
  for (const field of fields) {
    for (const group of field.visibleWhen ?? []) {
      for (const rule of group) {
        if (!seen.has(rule.key)) {
          throw PluginContextError.metaBoxFieldUnknownConditionDriver({
            kind,
            id,
            fieldKey: field.key,
            driverKey: rule.key,
          });
        }
      }
    }
  }
}
