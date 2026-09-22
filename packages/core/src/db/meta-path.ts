/**
 * Where a meta key sits inside a `meta` column, or `null` for a key that has
 * no path at all. One spelling, so a key written through the meta pipeline and
 * a key read back by `json_extract` cannot disagree about where the value is.
 *
 * SQLite's unquoted `$.label` accepts only `[A-Za-z0-9_]`, and a meta key may
 * hold `-` or `:`; the double-quoted `$."foo-bar"` takes those. A `"` or a `\`
 * would close the label and run on into the rest of the path, and SQLite's
 * path syntax has no escape for either — so such a key has no path, and each
 * caller refuses it in the vocabulary its own callers are holding.
 */
export function metaJsonPath(key: string): string | null {
  if (/["\\]/.test(key)) return null;
  return `$."${key}"`;
}
