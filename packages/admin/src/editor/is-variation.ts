import type { InsertableBlockEntry } from "@plumix/blocks";

// `expandBlockVariations` emits a parent block entry with `slug === name`
// and every variation entry with the variation's own raw slug — the
// inequality is the cheapest "is this a variation?" check at the row.
export function isVariation(entry: InsertableBlockEntry): boolean {
  return entry.slug !== entry.name;
}

// Stable identifier for React keys + `data-testid` suffixes. Plain block
// entries use their slug (which equals the name, e.g. `core/heading`).
// Variation entries get namespaced under the parent — two blocks both
// shipping a `bullet` variation would otherwise collide on raw slug.
export function entryKey(entry: InsertableBlockEntry): string {
  return isVariation(entry) ? `${entry.name}/${entry.slug}` : entry.slug;
}
