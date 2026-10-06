/**
 * An entry or term item's own label: its title when that is set, `null`
 * when the item follows the linked entry's or term's title. A
 * whitespace-only title counts as unset. The public render and the admin
 * item states both decide with this, so they agree.
 */
export function itemOwnLabel(title: string): string | null {
  return title.trim().length > 0 ? title : null;
}
