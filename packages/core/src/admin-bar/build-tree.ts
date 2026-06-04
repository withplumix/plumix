import type { AdminBarNode, AdminBarTreeNode } from "./types.js";

export function buildAdminBarTree(
  nodes: readonly AdminBarNode[],
): readonly AdminBarTreeNode[] {
  // Position-sort with stable insertion-order tie-break; nodes without a
  // position sort after positioned ones (treated as +Infinity).
  const indexed = nodes.map((node, insertOrder) => ({ node, insertOrder }));
  indexed.sort((a, b) => {
    const pa = a.node.position ?? Number.POSITIVE_INFINITY;
    const pb = b.node.position ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return a.insertOrder - b.insertOrder;
  });

  const ids = new Set(nodes.map((n) => n.id));
  const childrenByParent = new Map<string, AdminBarTreeNode[]>();
  const roots: AdminBarTreeNode[] = [];

  for (const { node } of indexed) {
    const tree: AdminBarTreeNode = { ...node, children: [] };
    const parent = node.parent;
    if (parent !== undefined && ids.has(parent)) {
      const bucket = childrenByParent.get(parent) ?? [];
      bucket.push(tree);
      childrenByParent.set(parent, bucket);
    } else {
      roots.push(tree);
    }
  }

  // Rebuild each tree node so children get filled in. The `children` we
  // pushed above are the same object references as what's in the map.
  const finalize = (tree: AdminBarTreeNode): AdminBarTreeNode => {
    const kids = childrenByParent.get(tree.id) ?? [];
    return { ...tree, children: kids.map(finalize) };
  };

  return roots.map(finalize);
}
