// The meta a new entity starts with. Pure and structural so the server's
// compiled `MetaBoxField`s and the admin's `MetaBoxFieldManifestEntry`s answer
// the same way. Re-exported from the public `@plumix/core/manifest` barrel.

import type { JsonObject, JsonValue } from "../../json.js";

/**
 * A group's members are `fields` on the server and `subFields` on the wire; a
 * repeater's `subFields` matter only to its builder.
 */
export interface StartingMetaField {
  readonly key: string;
  readonly inputType: string;
  readonly default?: unknown;
  readonly fields?: readonly StartingMetaField[];
  readonly subFields?: readonly StartingMetaField[];
}

/**
 * For a group without a `.default()`, its members' starting meta. A field with
 * no starting value is left out.
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
