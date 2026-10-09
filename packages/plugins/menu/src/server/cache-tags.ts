/**
 * What a page rendering this menu read, and what a write to the menu changes.
 * Keyed by term id rather than slug, so a save after a rename still reaches the
 * pages that rendered the old slug.
 */
export function menuRead(termId: number): {
  readonly kind: "own";
  readonly namespace: "menu";
  readonly id: number;
} {
  return { kind: "own", namespace: "menu", id: termId };
}
