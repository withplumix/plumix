import type { BlockSpecLookup } from "./block-slots.js";
import type { BlockNode } from "./render-block-tree.js";
import { blockSlotKeys } from "./block-slots.js";
import { isBlockNodeArray } from "./render-block-tree.js";

/**
 * Find a block node by id anywhere in the tree, descending into the slots
 * `blocks` declares on each node. Returns null when absent. Used to isolate a
 * single block's subtree — e.g. to re-run only its loader.
 */
export function findBlockNode(
  nodes: readonly BlockNode[],
  id: string,
  blocks: BlockSpecLookup,
): BlockNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    for (const key of blockSlotKeys(node, blocks.get(node.name))) {
      const value = node.attrs?.[key];
      if (!isBlockNodeArray(value)) continue;
      const found = findBlockNode(value, id, blocks);
      if (found) return found;
    }
  }
  return null;
}
