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
    const variations = spec.variations ?? [];
    const inserterVariations = variations.filter((v) =>
      (v.scope ?? ["inserter"]).includes("inserter"),
    );
    const hasBlockScoped = variations.some((v) => v.scope?.includes("block"));
    for (const v of inserterVariations) {
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
    // The parent block becomes its own inserter card when:
    //   - no variations exist (the original baseline), or
    //   - at least one variation is block-scoped (so the user can land
    //     on a picker that lists the layout choices).
    if (variations.length === 0 || hasBlockScoped) {
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
  }
  return out;
}
