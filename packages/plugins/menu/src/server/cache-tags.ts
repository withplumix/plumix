/**
 * Keyed by term id, not slug, so a save after a rename still purges pages that
 * rendered the old slug.
 */
export function menuTag(termId: number): string {
  return `menu:${String(termId)}`;
}
