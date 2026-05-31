import type { BlockSpec, BlockVariationExample } from "./block-registry.js";
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
  // Preview-only override for inserter card / picker card rendering.
  // Insertion paths still use `attrs` + `innerBlocks` above.
  readonly example?: BlockVariationExample;
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
        example: v.example,
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

// Structural shape shared by InsertableBlockEntry and BlockVariation —
// both carry runtime `attrs`/`innerBlocks` plus an optional `example`
// preview override. Typing the helper against the shape (not the
// concrete entry type) lets the block-scope picker thumbnail resolve
// previews straight from a BlockVariation.
export interface VariationPreviewSource {
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly innerBlocks?: readonly BlockNode[];
  readonly example?: BlockVariationExample;
}

// Resolves the preview data for a variation: example overrides applied
// on top of the runtime attrs/innerBlocks. Used by preview surfaces
// (inserter cards, block-scope picker thumbnails) — never by insertion
// paths.
export function resolveVariationPreview(source: VariationPreviewSource): {
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly innerBlocks: readonly BlockNode[];
} {
  return {
    attrs: source.example?.attrs ?? source.attrs ?? {},
    innerBlocks: source.example?.innerBlocks ?? source.innerBlocks ?? [],
  };
}
