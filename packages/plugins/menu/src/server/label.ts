/**
 * `null` when the item follows its target's title; whitespace-only counts as
 * unset.
 */
export function itemOwnLabel(title: string): string | null {
  return title.trim().length > 0 ? title : null;
}
