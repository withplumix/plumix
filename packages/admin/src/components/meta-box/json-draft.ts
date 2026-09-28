/**
 * Interpret the raw text of the JSON field's editor. Blank clears the
 * value (stored `null`); valid JSON parses to its value; invalid JSON
 * reports the failure and yields no value, so the last good value is left in
 * place. The engine's parse message isn't carried: it is English the admin
 * didn't choose. Pure — the editing surface (CodeMirror) owns none of this.
 */
export type JsonDraftResult =
  | { readonly kind: "empty" }
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "error" };

export function evaluateJsonDraft(raw: string): JsonDraftResult {
  if (raw.trim() === "") return { kind: "empty" };
  try {
    return { kind: "value", value: JSON.parse(raw) as unknown };
  } catch {
    return { kind: "error" };
  }
}
