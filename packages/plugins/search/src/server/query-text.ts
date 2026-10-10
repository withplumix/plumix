import { escapeHtml } from "plumix/support";

/**
 * Need not be unguessable: content carrying this text is escaped with the
 * rest and yields only an inert stray `<mark>`.
 */
const MARK_OPEN = "<plumix:mark>";
const MARK_CLOSE = "</plumix:mark>";

export const SNIPPET_MARKERS = {
  open: MARK_OPEN,
  close: MARK_CLOSE,
  /** What FTS5 puts where it trimmed the surrounding text. */
  ellipsis: "…",
  /** Tokens per snippet — FTS5's own cap is 64. */
  tokens: 24,
} as const;

/**
 * FTS5 escapes nothing around its markers, so escape everything first and
 * only then restore them.
 */
const ESCAPED_OPEN = escapeHtml(MARK_OPEN);
const ESCAPED_CLOSE = escapeHtml(MARK_CLOSE);

export function highlightSnippet(raw: string): string {
  return escapeHtml(raw)
    .replaceAll(ESCAPED_OPEN, "<mark>")
    .replaceAll(ESCAPED_CLOSE, "</mark>");
}

/**
 * The closing quote is optional, so a stray quote mark becomes a phrase
 * rather than a syntax error.
 */
const TOKEN = /"([^"]*)"?|(\S+)/g;

interface QueryToken {
  readonly value: string;
  readonly exclude: boolean;
}

function tokensOf(query: string): readonly QueryToken[] {
  const tokens: QueryToken[] = [];
  for (const [, quoted, bare] of query.matchAll(TOKEN)) {
    const token = (quoted ?? bare ?? "").trim();
    if (token === "") continue;
    // Only a bare token: inside quotes a hyphen is part of the phrase, the
    // same reading core's own tokenizer gives it.
    const excluded = quoted === undefined && token.startsWith("-");
    const value = excluded ? token.slice(1) : token;
    if (value !== "") tokens.push({ value, exclude: excluded });
  }
  return tokens;
}

const phrase = (token: QueryToken): string =>
  `"${token.value.replaceAll('"', '""')}"`;

/**
 * Total: every input compiles to a valid expression, FTS5 operators inert. A
 * leading `-` excludes. Returns `null` for only exclusions, which FTS5 cannot
 * express.
 */
export function toMatchExpression(query: string): string | null {
  const tokens = tokensOf(query);
  // A phrase FTS5 would tokenize to nothing matches nothing, which is why
  // `tokensOf` drops the empty ones rather than turning `a ""` into `a`.
  const wanted = tokens.filter((token) => !token.exclude).map(phrase);
  if (wanted.length === 0) return null;
  const unwanted = tokens.filter((token) => token.exclude).map(phrase);
  const match = wanted.join(" ");
  return unwanted.length === 0
    ? match
    : `${match} NOT (${unwanted.join(" OR ")})`;
}
