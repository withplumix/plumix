import type { BlockRegistry, BlockVariation } from "./block-registry.js";

// Lookup helper for the editor's block-scope picker. Returns the
// variations a host should list when the user inserts a parent block
// with any `scope: ["block"]` variations. Capabilities filter the
// parent block's gate.
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
