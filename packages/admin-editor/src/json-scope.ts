import type { BlockNode, BlockSpecLookup } from "@plumix/core/blocks";

import { findBlock } from "./block-tree-ops.js";

export type JsonScope = "page" | "block";

/**
 * The JSON the source view shows for `scope`, or `null` when the block scope
 * has no selected block to show.
 */
export function jsonForScope(
  blocks: BlockSpecLookup,
  tree: readonly BlockNode[],
  activeId: string | null,
  scope: JsonScope,
): string | null {
  if (scope === "page") return JSON.stringify(tree, null, 2);
  const block = activeId ? findBlock(tree, activeId, blocks) : undefined;
  return block ? JSON.stringify(block, null, 2) : null;
}
