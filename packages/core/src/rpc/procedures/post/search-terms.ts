/**
 * Query tokenizer + LIKE-escape for post search.
 *
 * Mirrors WordPress's default search parsing shape (see
 * https://developer.wordpress.org/reference/classes/wp_query/parse_search/):
 *
 * - Double-quoted substrings become a single phrase term, verbatim
 *   (whitespace preserved, wildcards NOT interpreted).
 * - Bare tokens split on whitespace, each is its own term.
 * - A leading `-` on a bare token flags exclusion (NOT LIKE). Inside
 *   quotes, `-` is literal.
 * - Stopwords / sentence-mode fallback from WP are deliberately skipped —
 *   they're English-biased and can be added later via a search plugin.
 *
 * The handler side joins terms with AND and joins column matches for each
 * term with OR (`title OR content OR excerpt`). This module owns the
 * parsing and escaping only; it doesn't construct SQL.
 */

// Unicode-aware: matches NBSP, em-space, etc. Shared between the outer
// skip and the inner token-end scan so a non-ASCII whitespace char can
// never produce an empty token + stuck cursor (earlier regression).
const WHITESPACE = /\s/;

export interface SearchTerm {
  /** The plain substring to match (unescaped, unquoted). */
  readonly value: string;
  /** True for `-term`: wrap the column-OR clause in NOT (…). */
  readonly exclude: boolean;
}

/**
 * Tokenize a raw search string into phrases and terms.
 *
 * - Quoted phrases (`"a b"`) become a single term; the outer quotes are
 *   stripped, inner content is preserved verbatim. An unterminated opening
 *   quote consumes to end of input — matches WP's tolerant behavior.
 * - Bare runs of non-whitespace are individual terms.
 * - A leading `-` on a bare term marks exclusion; a bare `-` with no
 *   following characters is dropped.
 * - Empty / whitespace-only input yields an empty array.
 */
export function tokenizeSearchQuery(raw: string): readonly SearchTerm[] {
  const terms: SearchTerm[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw.charAt(i);
    if (WHITESPACE.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      const end = raw.indexOf('"', i + 1);
      const close = end === -1 ? raw.length : end;
      const inner = raw.slice(i + 1, close);
      if (inner.length > 0) terms.push({ value: inner, exclude: false });
      i = close + 1;
      continue;
    }
    let j = i;
    while (j < raw.length && !WHITESPACE.test(raw.charAt(j))) j++;
    const token = raw.slice(i, j);
    i = j;
    if (token.length === 0) continue;
    if (token.startsWith("-")) {
      const rest = token.slice(1);
      if (rest.length > 0) terms.push({ value: rest, exclude: true });
      continue;
    }
    terms.push({ value: token, exclude: false });
  }
  return terms;
}

/**
 * Escape a raw term for use inside a SQL `LIKE` pattern.
 *
 * The handler pairs each `LIKE ?` with `ESCAPE '\\'`, so this function
 * backslash-escapes the three wildcard characters `\ % _`. Without this,
 * a user searching for `50%` would match every post.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}
