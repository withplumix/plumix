const MAX_LEN = 80;

type SqlParamKind = "string" | "number" | "boolean" | "null" | "blob";

export interface DescribedParam {
  readonly kind: SqlParamKind;
  readonly text: string;
}

/**
 * Describe a bound SQL parameter for the Database panel: its `kind` (for
 * per-type coloring) and display `text` (strings quoted, numbers/bigints/
 * booleans/null as literals, long strings truncated) — the `?`-form SQL stays
 * copyable. One pass so the kind and text can't drift apart.
 */
export function describeSqlParam(value: unknown): DescribedParam {
  if (value === null || value === undefined)
    return { kind: "null", text: "null" };
  if (typeof value === "string") {
    const text = value.length > MAX_LEN ? `${value.slice(0, MAX_LEN)}…` : value;
    return { kind: "string", text: `"${text}"` };
  }
  if (typeof value === "bigint")
    return { kind: "number", text: value.toString() };
  if (typeof value === "number") return { kind: "number", text: String(value) };
  if (typeof value === "boolean")
    return { kind: "boolean", text: String(value) };
  if (value instanceof Uint8Array) {
    return { kind: "blob", text: `<blob ${value.byteLength} bytes>` };
  }
  // Objects/dates are unusual as bound params — JSON gives a readable form.
  return { kind: "string", text: JSON.stringify(value) };
}
