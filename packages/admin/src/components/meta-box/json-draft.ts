/** Drops the engine's parse message: it is English the admin didn't choose. */
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
