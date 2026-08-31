import { escapeHtml } from "plumix";

/**
 * The markers FTS5 splices around a match. Chosen to look like markup rather
 * than to be unguessable: `escapeHtml` turns the angle brackets into entities,
 * so the restore below matches only the escaped form — and content that
 * happens to carry this exact text escapes with everything else and yields a
 * stray `<mark>`, which is inert, rather than an opening for anything.
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
 * Make a raw FTS5 snippet safe to render, keeping the highlight.
 *
 * FTS5 splices its markers in literally and escapes nothing around them, so a
 * snippet handed to a theme unescaped runs whatever script the indexed content
 * held. Everything is escaped first — core's helper covers `&`, `<` and `>`,
 * which is exactly the element-content case a snippet is — and only then are
 * the two markers restored.
 */
const ESCAPED_OPEN = escapeHtml(MARK_OPEN);
const ESCAPED_CLOSE = escapeHtml(MARK_CLOSE);

export function highlightSnippet(raw: string): string {
  return escapeHtml(raw)
    .replaceAll(ESCAPED_OPEN, "<mark>")
    .replaceAll(ESCAPED_CLOSE, "</mark>");
}

// Anything between double quotes, or a run of non-space characters. The
// closing quote is optional, so an unterminated one takes the rest of the
// input as its phrase — which is what turns a visitor's stray quote mark into
// a search rather than a syntax error.
const TOKEN = /"([^"]*)"?|(\S+)/g;

/**
 * Turn what a visitor typed into an FTS5 match expression, or `null` when
 * there is nothing to look for.
 *
 * Every token is emitted as a quoted phrase, joined by FTS5's implicit AND —
 * so adding a word narrows the result set, a quoted phrase stays one phrase,
 * and every operator the syntax defines (`AND`, `NEAR`, `*`, `^`, `-`) is
 * inert. That totality is the point: any string a visitor can type compiles to
 * a valid expression, so a malformed query is an empty result set rather than
 * an error page, without a `try`/`catch` standing in for a guarantee.
 */
export function toMatchExpression(query: string): string | null {
  const phrases: string[] = [];
  for (const [, quoted, bare] of query.matchAll(TOKEN)) {
    const token = (quoted ?? bare ?? "").trim();
    // A phrase FTS5 would tokenize to nothing matches nothing, so an empty one
    // would silently turn "a" AND "" into a search for "a" alone.
    if (token === "") continue;
    phrases.push(`"${token.replaceAll('"', '""')}"`);
  }
  return phrases.length === 0 ? null : phrases.join(" ");
}
