// A denylist suffices because React escapes HTML in `<style>` text, leaving
// only closed CSS-grammar breakouts. A match discards the value rather than
// escaping it.
const DANGEROUS_CSS = [
  /[{}<>]/, // declaration-block / tag breakout
  /\\/, // backslash escapes (unicode-escape obfuscation)
  /expression\s*\(/i, // legacy IE expression() script execution
  /(javascript|vbscript|data)\s*:/i, // dangerous url() schemes
  /[;@]/, // extra declarations / at-rules
];

/**
 * Returns the trimmed value, or `null` when it is empty or carries a breakout
 * or injection vector.
 */
export function sanitizeCssValue(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (DANGEROUS_CSS.some((re) => re.test(trimmed))) return null;
  return trimmed;
}
