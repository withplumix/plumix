import type { BlockRegistry, BlockVariation } from "./block-registry.js";

export function resolveBlockScopeVariations(
  blocks: BlockRegistry,
  blockName: string,
  capabilities?: ReadonlySet<string>,
): readonly BlockVariation[] {
  const spec = blocks.get(blockName);
  if (!spec?.variations) return [];
  if (spec.capability && capabilities && !capabilities.has(spec.capability)) {
    return [];
  }
  return spec.variations.filter((v) => v.scope?.includes("block"));
}
