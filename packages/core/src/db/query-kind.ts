export type QueryKind = "select" | "insert" | "update" | "delete" | "other";

const KNOWN_KINDS = new Set(["select", "insert", "update", "delete"]);

// Shared by prod tracing and the dev bar's Database panel, hence not in the
// debug-bar UI.
export function queryKind(sql: string): QueryKind {
  const first = sql.trimStart().split(/\s/, 1)[0]?.toLowerCase() ?? "";
  return (KNOWN_KINDS.has(first) ? first : "other") as QueryKind;
}
