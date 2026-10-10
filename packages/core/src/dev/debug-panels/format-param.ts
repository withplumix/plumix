const MAX_LEN = 80;

type SqlParamKind = "string" | "number" | "boolean" | "null";

export interface DescribedParam {
  readonly kind: SqlParamKind;
  readonly text: string;
}

/**
 * Long strings are truncated. One pass so the kind and text can't drift
 * apart.
 */
export function describeSqlParam(value: unknown): DescribedParam {
  if (value === null || value === undefined)
    return { kind: "null", text: "null" };
  if (typeof value === "string") {
    const text = value.length > MAX_LEN ? `${value.slice(0, MAX_LEN)}…` : value;
    return { kind: "string", text: `"${text}"` };
  }
  if (typeof value === "number") return { kind: "number", text: String(value) };
  if (typeof value === "boolean")
    return { kind: "boolean", text: String(value) };
  // Nested arrays/objects are unusual as params — JSON gives a readable form.
  return { kind: "string", text: JSON.stringify(value) };
}
