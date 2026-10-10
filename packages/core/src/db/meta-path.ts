/**
 * `null` for a key holding `"` or `\`: SQLite's path syntax has no escape for
 * either. One spelling, so meta writes and `json_extract` reads agree.
 */
export function metaJsonPath(key: string): string | null {
  if (/["\\]/.test(key)) return null;
  return `$."${key}"`;
}
