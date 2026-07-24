/**
 * Interpret the raw text of the JSON field's editor. Blank clears the
 * value (stored `null`); valid JSON parses to its value; invalid JSON
 * reports a parse message and yields no value, so the last good value is
 * left in place. Pure — the editing surface (CodeMirror) owns none of this.
 */
export type JsonDraftResult =
  | { readonly kind: "empty" }
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "error"; readonly message: string };

export function evaluateJsonDraft(raw: string): JsonDraftResult {
  if (raw.trim() === "") return { kind: "empty" };
  try {
    return { kind: "value", value: JSON.parse(raw) as unknown };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "",
    };
  }
}
