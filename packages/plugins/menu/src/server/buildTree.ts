/**
 * Items unreachable from a root (`parentId === null`) — missing parent or
 * cycle — are returned in `orphans` so the caller decides whether to drop,
 * surface, or promote them. Slice 1 drops silently at render and surfaces
 * in admin.
 *
 * Precondition: ids are unique. Duplicate ids are silently deduped via the
 * `visited` set — any item past the first occurrence is dropped from both
 * `tree` and `orphans`. The DB primary key on `entries.id` enforces this
 * for the production call site.
 */
interface TreeBuildable {
  readonly id: number;
  readonly parentId: number | null;
  readonly sortOrder: number;
}

export type TreeNode<T extends TreeBuildable> = T & {
  readonly children: readonly TreeNode<T>[];
};

interface BuildTreeResult<T extends TreeBuildable> {
  readonly tree: readonly TreeNode<T>[];
  readonly orphans: readonly T[];
}

export function buildTree<T extends TreeBuildable>(
  items: readonly T[],
): BuildTreeResult<T> {
  const childrenByParent = new Map<number | null, T[]>();
  for (const item of items) {
    const list = childrenByParent.get(item.parentId);
    if (list) {
      list.push(item);
    } else {
      childrenByParent.set(item.parentId, [item]);
    }
  }

  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  const visited = new Set<number>();

  const build = (parentId: number | null): TreeNode<T>[] => {
    const list = childrenByParent.get(parentId);
    if (!list) return [];
    const out: TreeNode<T>[] = [];
    for (const item of list) {
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      out.push({ ...item, children: build(item.id) });
    }
    return out;
  };

  const tree = build(null);
  const orphans = items.filter((item) => !visited.has(item.id));
  return { tree, orphans };
}
