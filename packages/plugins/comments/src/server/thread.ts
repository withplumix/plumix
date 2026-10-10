interface ThreadInput<T> {
  readonly id: number;
  readonly parentId: number | null;
  readonly value: T;
}

export interface ThreadNode<T> {
  readonly value: T;
  readonly replies: readonly ThreadNode<T>[];
}

interface MutableNode<T> {
  readonly value: T;
  readonly replies: ThreadNode<T>[];
}

/**
 * Preserves input order within each sibling group. A node whose `parentId`
 * isn't in the set is promoted to a root.
 */
export function assembleThread<T>(
  items: readonly ThreadInput<T>[],
): ThreadNode<T>[] {
  const nodes = new Map<number, MutableNode<T>>();
  for (const item of items) {
    nodes.set(item.id, { value: item.value, replies: [] });
  }

  const roots: ThreadNode<T>[] = [];
  for (const item of items) {
    const node = nodes.get(item.id);
    if (!node) continue;
    const parent =
      item.parentId !== null ? nodes.get(item.parentId) : undefined;
    if (parent) {
      parent.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
