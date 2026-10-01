// The meta a new entity starts with. Pure and structural so the server's
// compiled `MetaBoxField`s and the admin's `MetaBoxFieldManifestEntry`s answer
// the same way. Re-exported from the public `@plumix/core/manifest` barrel.

import type { JsonObject, JsonValue } from "../../json.js";

/**
 * The members of a field `startingMeta` reads. A group's members are `fields`
 * on the server and `subFields` on the wire; a repeater's `subFields` matter
 * only to its builder, which completes the default rows when it is declared.
 */
export interface StartingMetaField {
  readonly key: string;
  readonly inputType: string;
  readonly default?: unknown;
  readonly fields?: readonly StartingMetaField[];
  readonly subFields?: readonly StartingMetaField[];
}

/**
 * The starting meta for a set of meta-box fields, in stored shape: each
 * field's `.default()`, and for a group without one, its members' starting
 * meta. A field with no starting value is left out. Written into an entity
 * when it is created (ADR 0026) — nothing fills it in on read.
 */
export function startingMeta(fields: readonly StartingMetaField[]): JsonObject {
  const bag: Record<string, JsonValue> = {};
  for (const field of fields) {
    const value = startingValue(field);
    if (value !== undefined) bag[field.key] = value;
  }
  return bag;
}

function startingValue(field: StartingMetaField): JsonValue | undefined {
  // Declared in the stored shape, which is JSON.
  if (field.default !== undefined) return field.default as JsonValue;
  if (field.inputType !== "group") return undefined;
  const members = startingMeta(field.fields ?? field.subFields ?? []);
  return Object.keys(members).length > 0 ? members : undefined;
}
