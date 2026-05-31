import type { InsertableBlockEntry } from "@plumix/blocks";

// `expandBlockVariations` emits a parent block entry with `slug === name`
// and every variation entry with the variation's own raw slug — the
// inequality is the cheapest "is this a variation?" check at the row.
export function isVariation(entry: InsertableBlockEntry): boolean {
  return entry.slug !== entry.name;
}
