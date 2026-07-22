export type QueryKind = "select" | "insert" | "update" | "delete" | "other";

const KNOWN_KINDS = new Set(["select", "insert", "update", "delete"]);

/**
 * The leading statement kind. Names every query span (`db: select`) and colors
 * the Database panel's per-query badge — shared by prod tracing and the dev
 * bar, hence its home here rather than in the debug-bar UI.
 */
export function queryKind(sql: string): QueryKind {
  const first = sql.trimStart().split(/\s/, 1)[0]?.toLowerCase() ?? "";
  return (KNOWN_KINDS.has(first) ? first : "other") as QueryKind;
}
