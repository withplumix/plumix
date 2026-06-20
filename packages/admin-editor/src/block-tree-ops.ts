import type { BlockNode } from "@plumix/blocks";
import { isBlockNodeArray } from "@plumix/blocks";

/** Find a block by id anywhere in the tree, descending into slot attrs. */
export function findBlock(
  nodes: readonly BlockNode[],
  id: string,
): BlockNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    for (const value of Object.values(node.attrs ?? {})) {
      if (!isBlockNodeArray(value)) continue;
      const found = findBlock(value, id);
      if (found) return found;
    }
  }
  return undefined;
}

export interface FlatNode {
  readonly id: string;
  readonly name: string;
  /** Nesting depth; 0 for top-level blocks. */
  readonly depth: number;
  /** The slot-owning block's id, or null at the top level. */
  readonly parentId: string | null;
  /** Whether this block can hold children (has a slot) — gates nesting onto it. */
  readonly hasSlot: boolean;
}

/**
 * Flatten the nested tree to a depth-first outline (a node immediately
 * followed by its children), the shape the Layers list renders. Descends only
 * the block's first slot — the same one `moveBlock` writes — so the outline and
 * drag targets address the same children. Multi-slot blocks (e.g. columns)
 * surface only their first slot in the tree for now; see [[#1108 follow-up]].
 */
export function flattenTree(tree: readonly BlockNode[]): readonly FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (
    nodes: readonly BlockNode[],
    depth: number,
    parentId: string | null,
  ): void => {
    for (const node of nodes) {
      const key = slotKey(node);
      out.push({
        id: node.id,
        name: node.name,
        depth,
        parentId,
        hasSlot: key !== null,
      });
      const children = key !== null ? node.attrs?.[key] : undefined;
      if (isBlockNodeArray(children)) walk(children, depth + 1, node.id);
    }
  };
  walk(tree, 0, null);
  return out;
}

function arrayMove(
  items: readonly FlatNode[],
  from: number,
  to: number,
): FlatNode[] {
  const copy = items.slice();
  const [moved] = copy.splice(from, 1);
  if (moved) copy.splice(to, 0, moved);
  return copy;
}

/**
 * Resolve a tree drag (active dropped over `overId`, dragged `offsetX` pixels
 * horizontally) to a move target. The horizontal offset picks a depth — the
 * standard flattened-tree projection — clamped between the row below (its
 * depth) and one past the row above. Returns null when the active row is gone.
 */
export function projectMove(
  items: readonly FlatNode[],
  activeId: string,
  overId: string,
  offsetX: number,
  indentWidth: number,
): MoveTarget | null {
  const activeIndex = items.findIndex((i) => i.id === activeId);
  const overIndex = items.findIndex((i) => i.id === overId);
  if (activeIndex === -1 || overIndex === -1) return null;
  const active = items[activeIndex];
  if (!active) return null;

  const moved = arrayMove(items, activeIndex, overIndex);
  const prev = moved[overIndex - 1];
  const next = moved[overIndex + 1];
  const projected = active.depth + Math.round(offsetX / indentWidth);
  // Only nest one level deeper than the row above when that row can actually
  // hold children — otherwise the projection would name a slotless leaf as
  // parent and the move would silently no-op.
  const maxDepth = prev ? (prev.hasSlot ? prev.depth + 1 : prev.depth) : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.max(minDepth, Math.min(projected, maxDepth));

  const parentId = projectedParentId(moved, overIndex, depth, prev);
  const index = moved
    .slice(0, overIndex)
    .filter((i) => i.id !== activeId && i.parentId === parentId).length;
  return { parentId, index };
}

function projectedParentId(
  moved: readonly FlatNode[],
  overIndex: number,
  depth: number,
  prev: FlatNode | undefined,
): string | null {
  if (depth === 0 || !prev) return null;
  if (depth === prev.depth) return prev.parentId;
  if (depth > prev.depth) return prev.id;
  // Shallower than the row above: adopt the nearest earlier row at this depth.
  const ancestor = moved
    .slice(0, overIndex)
    .reverse()
    .find((i) => i.depth === depth);
  return ancestor?.parentId ?? null;
}

export interface MoveTarget {
  /** The new parent's id, or null to move to the top level. */
  readonly parentId: string | null;
  /** Insertion index among the target parent's children. */
  readonly index: number;
}

/**
 * Move a block to a new parent + index, immutably. Handles reorder (same
 * parent), nest (into a parent's slot) and un-nest (to the top level). Returns
 * the same tree reference when the move is invalid — source missing, dropping
 * into itself or its own descendant, or a target parent with no slot to hold
 * children — so a bad drag is a safe no-op rather than a lost subtree.
 */
export function moveBlock(
  tree: readonly BlockNode[],
  sourceId: string,
  target: MoveTarget,
): readonly BlockNode[] {
  if (target.parentId === sourceId) return tree;
  const source = findBlock(tree, sourceId);
  if (!source) return tree;
  if (target.parentId !== null) {
    const parent = findBlock(tree, target.parentId);
    if (!parent || slotKey(parent) === null) return tree;
    if (containsBlock(source, target.parentId)) return tree;
  }
  return insertNode(removeNode(tree, sourceId), source, target);
}

// The first attr key holding a child-block array, or null if the block has no
// slot. The layers tree addresses only this first slot — multi-slot blocks
// aren't fully reachable from the outline yet (tracked as a #1108 follow-up).
function slotKey(node: BlockNode): string | null {
  for (const [key, value] of Object.entries(node.attrs ?? {})) {
    if (isBlockNodeArray(value)) return key;
  }
  return null;
}

/** Whether `id` is `node` itself or anywhere in its subtree. */
function containsBlock(node: BlockNode, id: string): boolean {
  if (node.id === id) return true;
  for (const value of Object.values(node.attrs ?? {})) {
    if (isBlockNodeArray(value) && value.some((c) => containsBlock(c, id))) {
      return true;
    }
  }
  return false;
}

function removeNode(
  nodes: readonly BlockNode[],
  id: string,
): readonly BlockNode[] {
  const next = nodes.filter((node) => node.id !== id);
  let changed = next.length !== nodes.length;
  const mapped = next.map((node) => {
    const attrs = node.attrs;
    if (!attrs) return node;
    let nextAttrs: Record<string, unknown> | undefined;
    for (const [key, value] of Object.entries(attrs)) {
      if (!isBlockNodeArray(value)) continue;
      const pruned = removeNode(value, id);
      if (pruned !== value) (nextAttrs ??= { ...attrs })[key] = pruned;
    }
    if (!nextAttrs) return node;
    changed = true;
    return { ...node, attrs: nextAttrs };
  });
  return changed ? mapped : nodes;
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

function insertNode(
  nodes: readonly BlockNode[],
  node: BlockNode,
  target: MoveTarget,
): readonly BlockNode[] {
  if (target.parentId === null) {
    const at = clampIndex(target.index, nodes.length);
    return [...nodes.slice(0, at), node, ...nodes.slice(at)];
  }
  return nodes.map((current) => {
    if (current.id === target.parentId) {
      const key = slotKey(current);
      if (key === null) return current;
      const slot = current.attrs?.[key];
      const children = isBlockNodeArray(slot) ? slot : [];
      const at = clampIndex(target.index, children.length);
      return {
        ...current,
        attrs: {
          ...current.attrs,
          [key]: [...children.slice(0, at), node, ...children.slice(at)],
        },
      };
    }
    const attrs = current.attrs;
    if (!attrs) return current;
    let nextAttrs: Record<string, unknown> | undefined;
    for (const [key, value] of Object.entries(attrs)) {
      if (!isBlockNodeArray(value)) continue;
      const inserted = insertNode(value, node, target);
      if (inserted !== value) (nextAttrs ??= { ...attrs })[key] = inserted;
    }
    return nextAttrs ? { ...current, attrs: nextAttrs } : current;
  });
}
