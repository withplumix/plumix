// A small SQL syntax-highlighter for the Database panel (idea borrowed from
// drizzle-query-logger, adapted from terminal colors to CSS token spans).

const KEYWORDS = new Set([
  "select",
  "distinct",
  "from",
  "where",
  "and",
  "or",
  "not",
  "in",
  "is",
  "null",
  "like",
  "between",
  "insert",
  "into",
  "values",
  "update",
  "set",
  "delete",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "cross",
  "on",
  "as",
  "order",
  "by",
  "group",
  "having",
  "limit",
  "offset",
  "asc",
  "desc",
  "union",
  "all",
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "returning",
  "exists",
  "case",
  "when",
  "then",
  "else",
  "end",
  "pragma",
]);

type SqlTokenKind = "keyword" | "string" | "number" | "text";

export interface SqlToken {
  readonly text: string;
  readonly kind: SqlTokenKind;
}

// One alternation per token class; the last branch mops up whitespace and
// punctuation (including `?` placeholders, and a lone unterminated `'`) so
// tokenization stays lossless for any input.
const TOKEN =
  /('(?:[^']|'')*')|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\s+|[^\w'\s]+|')/g;

export function tokenizeSql(sql: string): readonly SqlToken[] {
  const tokens: SqlToken[] = [];
  for (const m of sql.matchAll(TOKEN)) {
    if (m[1] !== undefined) tokens.push({ text: m[1], kind: "string" });
    else if (m[2] !== undefined) tokens.push({ text: m[2], kind: "number" });
    else if (m[3] !== undefined) {
      tokens.push({
        text: m[3],
        kind: KEYWORDS.has(m[3].toLowerCase()) ? "keyword" : "text",
      });
    } else tokens.push({ text: m[4] ?? "", kind: "text" });
  }
  return tokens;
}

export type QueryKind = "select" | "insert" | "update" | "delete" | "other";

const KNOWN_KINDS = new Set(["select", "insert", "update", "delete"]);

/** The leading statement kind, for the per-query badge/color. */
export function queryKind(sql: string): QueryKind {
  const first = sql.trimStart().split(/\s/, 1)[0]?.toLowerCase() ?? "";
  return (KNOWN_KINDS.has(first) ? first : "other") as QueryKind;
}
