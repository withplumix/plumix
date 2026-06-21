// Patterns that must never appear in an author-supplied raw CSS value. The
// trust boundary is the stored bytes — a raw value is emitted verbatim into a
// `<style>` declaration, so anything that could break out of the declaration
// block or smuggle script is dropped wholesale (the value is discarded, not
// escaped, since a "fixed up" CSS value is rarely what the author meant).
//
// A denylist is safe here because the residual surface is the closed CSS-grammar
// set: React already escapes `<`/`>`/`&` in `<style>` text, so HTML breakout is
// inert and only braces / at-rules / extra declarations / dangerous schemes
// remain. The brace rule is the load-bearing defense; `expression()` is kept for
// belt-and-suspenders though it executes in no shipping browser.
const DANGEROUS_CSS = [
  /[{}<>]/, // declaration-block / tag breakout
  /\\/, // backslash escapes (unicode-escape obfuscation)
  /expression\s*\(/i, // legacy IE expression() script execution
  /(javascript|vbscript|data)\s*:/i, // dangerous url() schemes
  /[;@]/, // extra declarations / at-rules
];

/**
 * A custom CSS value the emitter can safely write into a declaration, or
 * `null` when it carries a breakout / injection vector. Trims surrounding
 * whitespace; rejects empties. Token-bound values never pass through here —
 * only authored raw values do.
 */
export function sanitizeCssValue(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (DANGEROUS_CSS.some((re) => re.test(trimmed))) return null;
  return trimmed;
}
