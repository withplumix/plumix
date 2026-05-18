import type {
  BlockRegistry,
  BlockVariation,
  BlockVariationInnerBlock,
} from "@plumix/blocks";

export interface SlashMenuItem {
  readonly name: string;
  readonly title: string;
  readonly description?: string;
  readonly category: string;
  readonly keywords?: readonly string[];
  /** Lucide icon name resolved at render time. */
  readonly icon?: string;
  /**
   * When this item is a variation, the parent block's name. The editor
   * uses this to insert a node of `parent`'s type rather than `name`'s
   * (since variation items don't have their own Tiptap schema).
   */
  readonly parent?: string;
  /**
   * Preset attrs for the inserted node (variation only).
   */
  readonly attributes?: Readonly<Record<string, unknown>>;
  /**
   * Templated children to materialise under the inserted node
   * (variation only).
   */
  readonly innerBlocks?: readonly BlockVariationInnerBlock[];
}

/**
 * Project the block registry into SlashMenuItem entries — one per
 * block, plus one per variation declared on each block. Variation
 * items carry their parent block's name so the editor knows which
 * Tiptap node to insert.
 *
 * Skips child-only specs (those carrying a `parent` declaration) since
 * the user inserts them through the parent's own template, not as a
 * standalone slash-menu choice.
 */
export function itemsFromRegistry(
  registry: BlockRegistry,
): readonly SlashMenuItem[] {
  const items: SlashMenuItem[] = [];
  for (const [, spec] of registry) {
    const parent = (spec as unknown as { parent?: unknown }).parent;
    if (typeof parent === "string") continue;
    // `inserter: false` keeps content-only children (table rows,
    // table cells) out of the standalone slash menu — they enter
    // the document through a parent's variation template.
    if (spec.inserter === false) continue;
    items.push({
      name: spec.name,
      title: spec.title,
      description: spec.description,
      category: spec.category ?? "typography",
      keywords: spec.keywords,
      icon: spec.icon,
      // Bare-block items inherit the spec's `defaultInnerBlocks` so
      // wrapper blocks (list, quote, columns) materialise valid
      // children — otherwise Tiptap silently degrades the empty
      // insertion to the default block.
      innerBlocks: spec.defaultInnerBlocks,
    });
    for (const variation of spec.variations ?? []) {
      items.push(
        variationToItem(spec.name, spec.category, variation, spec.icon),
      );
    }
  }
  return items;
}

function variationToItem(
  parentName: string,
  parentCategory: string | undefined,
  variation: BlockVariation,
  parentIcon: string | undefined,
): SlashMenuItem {
  return {
    name: `${parentName}:${variation.name}`,
    title: variation.title,
    description: variation.description,
    category: parentCategory ?? "typography",
    keywords: variation.keywords,
    icon: variation.icon ?? parentIcon,
    parent: parentName,
    attributes: variation.attributes,
    innerBlocks: variation.innerBlocks,
  };
}
