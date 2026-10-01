/**
 * The CDN tag a page rendering this menu is stored under, and that a write
 * to the menu purges. Keyed by term id rather than slug, so a save after a
 * rename still reaches the pages that rendered the old slug.
 */
export function menuTag(termId: number): string {
  return `menu:${String(termId)}`;
}
