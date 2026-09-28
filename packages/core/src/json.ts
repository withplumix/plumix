/**
 * A JSON-serializable value — the sanctioned alternative to a dictionary of
 * `unknown` for data crossing a serialization boundary (#1811).
 *
 * Enforced by type only — nothing checks the value at runtime.
 */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | JsonObject;

/**
 * The object arm of {@link JsonValue}.
 *
 * Only an anonymous object type or a `type` alias of one satisfies this.
 * TypeScript withholds the implicit index signature from `interface`
 * declarations, so a named interface fails to assign however JSON-shaped its
 * members are — and aliasing an interface inherits the same gap. Declare such
 * shapes as a `type` over an object literal if they have to travel as JSON.
 */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/**
 * `Array.isArray` alone won't tell these two apart inside a {@link JsonValue}:
 * it widens the array side to `any[]` and leaves the readonly array in the
 * union on the object side.
 */
export function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

export function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
