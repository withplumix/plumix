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
 * Only an anonymous object type or a `type` alias satisfies this. TypeScript
 * withholds the implicit index signature from `interface` declarations, so a
 * named interface fails to assign however JSON-shaped its members are —
 * declare such shapes with `type` if they have to travel as a `JsonObject`.
 */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
