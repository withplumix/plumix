import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";

/**
 * Find a block node by id anywhere in the tree, descending into slot attrs
 * (any attr whose value is a BlockNode[]). Returns null when absent. Used to
 * isolate a single block's subtree — e.g. to re-run only its loader.
 */
export function findBlockNode(
  nodes: readonly BlockNode[],
  id: string,
): BlockNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (!node.attrs) continue;
    for (const value of Object.values(node.attrs)) {
      if (!isBlockNodeArray(value)) continue;
      const found = findBlockNode(value, id);
      if (found) return found;
    }
  }
  return null;
}
