import type { BlockSpec } from "./block-registry.js";
import type { BlockNode } from "./render-block-tree.js";

export interface InsertableBlockEntry {
  readonly name: string;
  readonly slug: string;
  readonly title: string;
  readonly description?: string;
  readonly category?: string;
  readonly icon?: string;
  readonly keywords?: readonly string[];
  readonly attrs?: Readonly<Record<string, unknown>>;
  // Default body for the parent block's conventional `content` slot.
  // Caller deep-clones + ID-rewrites before merging into a block instance.
  readonly innerBlocks?: readonly BlockNode[];
}

export function expandBlockVariations(
  specs: Iterable<BlockSpec>,
): readonly InsertableBlockEntry[] {
  const out: InsertableBlockEntry[] = [];
  for (const spec of specs) {
    if (spec.variations && spec.variations.length > 0) {
      for (const v of spec.variations) {
        out.push({
          name: spec.name,
          slug: v.slug,
          title: v.title,
          description: v.description,
          category: spec.category,
          icon: v.icon,
          keywords: v.keywords,
          attrs: v.attrs,
          innerBlocks: v.innerBlocks,
        });
      }
      continue;
    }
    out.push({
      name: spec.name,
      slug: spec.name,
      title: spec.title ?? spec.name,
      description: spec.description,
      category: spec.category,
      icon: spec.icon,
      keywords: spec.keywords,
    });
  }
  return out;
}
