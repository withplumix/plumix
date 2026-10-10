// Mirrors WordPress's search parsing, minus its English-biased stopwords:
// https://developer.wordpress.org/reference/classes/wp_query/parse_search/

/**
 * Unicode-aware: matches NBSP, em-space, etc. Shared between the outer
 * skip and the inner token-end scan so a non-ASCII whitespace char can
 * never produce an empty token + stuck cursor (earlier regression).
 */
const WHITESPACE = /\s/;

export interface SearchTerm {
  /** The plain substring to match (unescaped, unquoted). */
  readonly value: string;
  /** True for `-term`: wrap the column-OR clause in NOT (…). */
  readonly exclude: boolean;
}

/**
 * Quoted phrases stay verbatim; an unterminated quote runs to the end, as in
 * WP. A leading `-` on a bare term marks exclusion.
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

/** For a `LIKE ?` paired with `ESCAPE '\\'`. */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}
