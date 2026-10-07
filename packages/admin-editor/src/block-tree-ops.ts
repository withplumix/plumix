import type {
  BlockNode,
  BlockSpecLookup,
  JsonValue,
} from "@plumix/core/blocks";
import {
  blockSlotKeys,
  freshBlockId,
  isBlockNodeArray,
  rewriteBlockNodeIds,
} from "@plumix/core/blocks";

// Every op takes the block specs as `blocks`: a node's slots are the inputs its
// spec declares, so an attr holding a data array is never walked as children.

/** Find a block by id anywhere in the tree, descending into its slots. */
export function findBlock(
  nodes: readonly BlockNode[],
  id: string,
  blocks: BlockSpecLookup,
): BlockNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    for (const children of slotChildren(node, blocks)) {
      const found = findBlock(children, id, blocks);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * The id of the block whose slot directly holds `id`, or null when `id` is a
 * top-level block or absent. Descends every slot, so select-parent resolves
 * inside multi-slot blocks.
 */
export function findParentId(
  nodes: readonly BlockNode[],
  id: string,
  blocks: BlockSpecLookup,
  parent: string | null = null,
): string | null {
  for (const node of nodes) {
    if (node.id === id) return parent;
    for (const children of slotChildren(node, blocks)) {
      const hit = findParentId(children, id, blocks, node.id);
      if (hit !== null) return hit;
    }
  }
  return null;
}

/**
 * The top-level index just after `activeId`'s top-level ancestor (itself when
 * top-level), or the end of the tree when nothing is active or it's absent.
 * Where an insert lands with a selection: next to what the author is looking
 * at, but never inside a nested slot whose allowedBlocks it can't honor.
 */
export function topLevelIndexAfter(
  tree: readonly BlockNode[],
  activeId: string | null,
  blocks: BlockSpecLookup,
): number {
  let rootId = activeId;
  while (rootId !== null) {
    const parent = findParentId(tree, rootId, blocks);
    if (parent === null) break;
    rootId = parent;
  }
  const at = tree.findIndex((node) => node.id === rootId);
  return at === -1 ? tree.length : at + 1;
}

export interface FlatNode {
  readonly id: string;
  readonly name: string;
  /** Author-given instance label, or undefined to fall back to the type title. */
  readonly label?: string;
  /** Nesting depth; 0 for top-level blocks. */
  readonly depth: number;
  /** The slot-owning block's id, or null at the top level. */
  readonly parentId: string | null;
  /** Which of the parent's slots holds this block, or null at the top level. */
  readonly slotKey: string | null;
  /** Whether this block can hold children (has a slot) — gates nesting onto it. */
  readonly hasSlot: boolean;
}

/**
 * Flatten the nested tree to a depth-first outline (a node immediately
 * followed by its children), the shape the Layers list renders. A multi-slot
 * block lists each slot's children in turn, in declaration order; `slotKey`
 * tells them apart so a drag lands back in the slot it was dropped among.
 */
export function flattenTree(
  tree: readonly BlockNode[],
  blocks: BlockSpecLookup,
): readonly FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (
    nodes: readonly BlockNode[],
    depth: number,
    parentId: string | null,
    inSlot: string | null,
  ): void => {
    for (const node of nodes) {
      const keys = slotKeys(node, blocks);
      out.push({
        id: node.id,
        name: node.name,
        label: node.label,
        depth,
        parentId,
        slotKey: inSlot,
        hasSlot: keys.length > 0,
      });
      for (const key of keys) {
        const children = node.attrs?.[key];
        if (isBlockNodeArray(children)) walk(children, depth + 1, node.id, key);
      }
    }
  };
  walk(tree, 0, null, null);
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

  const slot = projectedSlot(moved, overIndex, depth, prev);
  const index = moved
    .slice(0, overIndex)
    .filter(
      (i) =>
        i.id !== activeId &&
        i.parentId === slot.parentId &&
        (slot.slotKey === undefined || i.slotKey === slot.slotKey),
    ).length;
  return { ...slot, index };
}

// Nesting under the row above targets its first slot; adopting a row's parent
// also adopts the slot that row sits in.
function projectedSlot(
  moved: readonly FlatNode[],
  overIndex: number,
  depth: number,
  prev: FlatNode | undefined,
): Omit<MoveTarget, "index"> {
  if (depth === 0 || !prev) return { parentId: null };
  if (depth > prev.depth) return { parentId: prev.id };
  // Shallower than the row above: adopt the nearest earlier row at this depth.
  const sibling =
    depth === prev.depth
      ? prev
      : moved
          .slice(0, overIndex)
          .reverse()
          .find((i) => i.depth === depth);
  if (sibling?.parentId == null) return { parentId: null };
  return sibling.slotKey === null
    ? { parentId: sibling.parentId }
    : { parentId: sibling.parentId, slotKey: sibling.slotKey };
}

export interface MoveTarget {
  /** The new parent's id, or null to move to the top level. */
  readonly parentId: string | null;
  /** Which of the parent's slots to drop into; defaults to its first slot. */
  readonly slotKey?: string;
  /** Insertion index among the target slot's children. */
  readonly index: number;
}

/**
 * Move a block to a new parent + slot + index, immutably. Handles reorder (same
 * parent), nest (into a named slot) and un-nest (to the top level). Returns the
 * same tree reference when the move is invalid — source missing, dropping into
 * itself or its own descendant, the target slot absent, or `allowed` given and
 * the source's name not in it — so a bad drag is a safe no-op, never a lost
 * subtree. `allowed` is the slot's `allowedBlocks` list (the caller resolves it
 * from the registry); undefined permits any block.
 */
export function moveBlock(
  tree: readonly BlockNode[],
  sourceId: string,
  target: MoveTarget,
  blocks: BlockSpecLookup,
  allowed?: readonly string[],
): readonly BlockNode[] {
  if (target.parentId === sourceId) return tree;
  const source = findBlock(tree, sourceId, blocks);
  if (!source) return tree;
  if (allowed && !allowed.includes(source.name)) return tree;
  if (!slotTargetExists(tree, target, blocks)) return tree;
  if (
    target.parentId !== null &&
    containsBlock(source, target.parentId, blocks)
  ) {
    return tree;
  }
  return insertNode(removeNode(tree, sourceId, blocks), source, target, blocks);
}

// Whether `target` names a real slot on a real parent. The top level always
// exists; a nested target needs the parent present and the key one of its
// declared slots, either already populated or unset — an unset slot is simply
// empty, and insertNode creates its array.
function slotTargetExists(
  tree: readonly BlockNode[],
  target: MoveTarget,
  blocks: BlockSpecLookup,
): boolean {
  if (target.parentId === null) return true;
  const parent = findBlock(tree, target.parentId, blocks);
  if (!parent) return false;
  const keys = slotKeys(parent, blocks);
  const key = target.slotKey ?? keys[0];
  if (key === undefined || !keys.includes(key)) return false;
  const value = parent.attrs?.[key];
  return value === undefined || isBlockNodeArray(value);
}

/**
 * Insert a (new) block at a parent + slot + index, immutably. Mirrors
 * moveBlock's validation for an insert rather than a relocation: a no-op (same
 * tree) when the target slot is absent, or `allowed` is given and the block's
 * name isn't in it. `parentId: null` inserts at the top level.
 */
export function insertBlockAt(
  tree: readonly BlockNode[],
  node: BlockNode,
  target: MoveTarget,
  blocks: BlockSpecLookup,
  allowed?: readonly string[],
): readonly BlockNode[] {
  if (allowed && !allowed.includes(node.name)) return tree;
  if (!slotTargetExists(tree, target, blocks)) return tree;
  return insertNode(tree, node, target, blocks);
}

/**
 * Remove every block in `ids` from the tree at once, immutably. Descends all
 * slots and returns the same reference when nothing matched, so untouched
 * branches stay referentially stable for React.
 */
export function removeBlocks(
  nodes: readonly BlockNode[],
  ids: ReadonlySet<string>,
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  if (ids.size === 0) return nodes;
  const kept = nodes.filter((node) => !ids.has(node.id));
  let changed = kept.length !== nodes.length;
  const mapped = kept.map((node) => {
    const attrs = node.attrs;
    if (!attrs) return node;
    let nextAttrs: Record<string, JsonValue> | undefined;
    for (const key of slotKeys(node, blocks)) {
      const value = attrs[key];
      if (!isBlockNodeArray(value)) continue;
      const pruned = removeBlocks(value, ids, blocks);
      if (pruned !== value) (nextAttrs ??= { ...attrs })[key] = pruned;
    }
    if (!nextAttrs) return node;
    changed = true;
    return { ...node, attrs: nextAttrs };
  });
  return changed ? mapped : nodes;
}

/**
 * Insert a fresh-id clone of `id` immediately after it within its own parent
 * slot. Ids are rewritten through the whole subtree so the duplicate is fully
 * independent. Returns the same tree and a null id when the source is absent.
 */
export function duplicateBlock(
  tree: readonly BlockNode[],
  id: string,
  blocks: BlockSpecLookup,
): { readonly tree: readonly BlockNode[]; readonly newId: string | null } {
  const source = findBlock(tree, id, blocks);
  if (!source) return { tree, newId: null };
  const [clone] = rewriteBlockNodeIds([source], blocks);
  if (!clone) return { tree, newId: null };
  const slot = siblingsOf(tree, id, blocks);
  const index = slot.siblings.findIndex((n) => n.id === id) + 1;
  return {
    tree: insertNode(tree, clone, { ...slot.at, index }, blocks),
    newId: clone.id,
  };
}

// The children of a block's sole slot, or null when it isn't a single-slot
// container with content. Ungroup only unwraps these: a multi-slot block (e.g.
// columns) has no unambiguous "the" slot, and unwrapping one would silently
// drop the others when the node is removed.
function soleSlotChildren(
  node: BlockNode,
  blocks: BlockSpecLookup,
): readonly BlockNode[] | null {
  const keys = slotKeys(node, blocks);
  const key = keys.length === 1 ? keys[0] : undefined;
  if (key === undefined) return null;
  const slot = node.attrs?.[key];
  return isBlockNodeArray(slot) && slot.length > 0 ? slot : null;
}

/** Whether {@link ungroupBlock} can unwrap this block — a single-slot container
 *  with children. The toolbar gates the Ungroup button on this. */
/** Whether `groupBlocks` would do anything: the selection's roots must all
 *  share one slot of one parent, since a group can't span containers. */
export function canGroupSelection(
  tree: readonly BlockNode[],
  selectedIds: ReadonlySet<string>,
  blocks: BlockSpecLookup,
): boolean {
  const roots = selectionRoots(tree, selectedIds, blocks);
  if (roots.length === 0) return false;
  const slot = siblingsOf(tree, roots[0] ?? "", blocks);
  return roots.every((id) => slot.siblings.some((n) => n.id === id));
}

export function canUngroupBlock(
  tree: readonly BlockNode[],
  id: string,
  blocks: BlockSpecLookup,
): boolean {
  const node = findBlock(tree, id, blocks);
  return node ? soleSlotChildren(node, blocks) !== null : false;
}

/**
 * Replace a single-slot container with its children, spliced into the block's
 * own parent at its position. Returns `null` when the block is missing, has no
 * children, or has more than one slot. Children keep their ids.
 *
 * The children move into the group's own parent slot; allowedBlocks /
 * requiresParent aren't re-validated here. Today nothing can nest a container in
 * a restricted slot, so it can't be violated — tracked with paste's follow-up.
 */
export function ungroupBlock(
  tree: readonly BlockNode[],
  id: string,
  blocks: BlockSpecLookup,
): { readonly tree: readonly BlockNode[]; readonly childIds: string[] } | null {
  const node = findBlock(tree, id, blocks);
  if (!node) return null;
  const children = soleSlotChildren(node, blocks);
  if (!children) return null;
  const slot = siblingsOf(tree, id, blocks);
  const at = slot.siblings.findIndex((n) => n.id === id);
  let next = removeBlocks(tree, new Set([id]), blocks);
  children.forEach((child, i) => {
    next = insertNode(next, child, { ...slot.at, index: at + i }, blocks);
  });
  return { tree: next, childIds: children.map((c) => c.id) };
}

/**
 * Wrap the selected blocks in a new `core/group` at the position of the first.
 * Only groups a selection whose roots are siblings (share one slot of one
 * parent) — returns `null` otherwise (or when nothing is selected), since a group can't span
 * containers. Children keep their ids; the group takes `groupId`.
 */
export function groupBlocks(
  tree: readonly BlockNode[],
  ids: ReadonlySet<string>,
  groupId: string,
  blocks: BlockSpecLookup,
): { readonly tree: readonly BlockNode[]; readonly groupId: string } | null {
  const roots = new Set(selectionRoots(tree, ids, blocks));
  if (roots.size === 0) return null;
  const slot = siblingsOf(tree, [...roots][0] ?? "", blocks);
  const siblings = slot.siblings;
  const content = siblings.filter((n) => roots.has(n.id));
  // All roots must be siblings in the same slot of the same parent.
  if (content.length !== roots.size) return null;
  const group: BlockNode = {
    id: groupId,
    name: "core/group",
    attrs: { content },
  };
  // Every sibling before the first root is, by definition, not a root, so the
  // post-removal insert position is just the first root's index.
  const insertIndex = siblings.findIndex((n) => roots.has(n.id));
  const pruned = removeBlocks(tree, roots, blocks);
  return {
    tree: insertNode(pruned, group, { ...slot.at, index: insertIndex }, blocks),
    groupId,
  };
}

/**
 * Collect the selected blocks as whole nodes, reduced to selection roots and
 * returned in document order (so a copy preserves the original sequence, unlike
 * the set-insertion order of {@link selectionRoots}). For clipboard copy.
 */
export function collectBlocks(
  tree: readonly BlockNode[],
  ids: ReadonlySet<string>,
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  const roots = new Set(selectionRoots(tree, ids, blocks));
  const out: BlockNode[] = [];
  const walk = (nodes: readonly BlockNode[]): void => {
    for (const node of nodes) {
      if (roots.has(node.id)) {
        out.push(node); // a root is taken whole — never descend into it
        continue;
      }
      for (const children of slotChildren(node, blocks)) walk(children);
    }
  };
  walk(tree);
  return out;
}

/**
 * Insert fresh-id clones of `nodes` after `afterId` (within its parent slot),
 * or appended to the root when `afterId` is null. Ids are rewritten through each
 * subtree so a paste is independent of its source and of repeated pastes.
 * Returns the new tree and the inserted roots' ids.
 */
export function pasteBlocks(
  tree: readonly BlockNode[],
  nodes: readonly BlockNode[],
  afterId: string | null,
  blocks: BlockSpecLookup,
): { readonly tree: readonly BlockNode[]; readonly newIds: readonly string[] } {
  const clones = rewriteBlockNodeIds(nodes, blocks);
  if (clones.length === 0) return { tree, newIds: [] };
  const slot = afterId ? siblingsOf(tree, afterId, blocks) : topLevelSlot(tree);
  const siblings = slot.siblings;
  const after = afterId ? siblings.findIndex((n) => n.id === afterId) : -1;
  const start = after >= 0 ? after + 1 : siblings.length;
  let next = tree;
  const newIds: string[] = [];
  clones.forEach((clone, i) => {
    next = insertNode(next, clone, { ...slot.at, index: start + i }, blocks);
    newIds.push(clone.id);
  });
  return { tree: next, newIds };
}

/**
 * Reduce a selection to its roots: ids that have no selected ancestor. Used by
 * bulk duplicate so a block isn't cloned twice when both it and its container
 * are selected (the container's clone already carries a copy of the child).
 */
export function selectionRoots(
  tree: readonly BlockNode[],
  ids: ReadonlySet<string>,
  blocks: BlockSpecLookup,
): string[] {
  return [...ids].filter((id) => {
    let parent = findParentId(tree, id, blocks);
    while (parent !== null) {
      if (ids.has(parent)) return false;
      parent = findParentId(tree, parent, blocks);
    }
    return true;
  });
}

/**
 * Move `id` by `delta` positions among its siblings (negative = up). A no-op
 * (same tree reference) at the ends or when the block is absent.
 */
export function moveBlockBy(
  tree: readonly BlockNode[],
  id: string,
  delta: number,
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  const { siblings, at } = siblingsOf(tree, id, blocks);
  const from = siblings.findIndex((n) => n.id === id);
  if (from === -1) return tree;
  const to = from + delta;
  if (to < 0 || to >= siblings.length) return tree;
  return moveBlock(tree, id, { ...at, index: to }, blocks);
}

const TABLE = "core/table";
const HEADER_ROW = "core/table-header-row";
const HEADER_CELL = "core/table-header-cell";
const BODY_ROW = "core/table-body-row";
const BODY_CELL = "core/table-cell";

function cellsOf(row: BlockNode): readonly BlockNode[] {
  const cells = row.attrs?.cells;
  return isBlockNodeArray(cells) ? cells : [];
}

/**
 * The id of the table enclosing `id` — `id` itself if it's a core/table, else
 * its nearest table ancestor (so a selected row or cell resolves to its table),
 * or null when nothing in the chain is a table. Lets the inspector keep the
 * table controls in reach while the editor is working inside a cell.
 */
export function enclosingTableId(
  tree: readonly BlockNode[],
  id: string,
  blocks: BlockSpecLookup,
): string | null {
  let current: string | null = id;
  while (current) {
    if (findBlock(tree, current, blocks)?.name === TABLE) return current;
    current = findParentId(tree, current, blocks);
  }
  return null;
}

// A table's column count is its widest row's cell count, so a new row/column
// keeps the grid rectangular even when existing rows disagree.
function columnCount(rows: readonly BlockNode[]): number {
  return rows.reduce((max, row) => Math.max(max, cellsOf(row).length), 0);
}

/**
 * Append a column to a table: a fresh cell at the end of every row's `cells`
 * slot — a `<th>` in the header row, a `<td>` in body rows. One immutable
 * transform, so it's a single undo step. A no-op (same tree ref) when `tableId`
 * isn't a core/table or the table has no rows.
 */
export function appendTableColumn(
  tree: readonly BlockNode[],
  tableId: string,
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  const table = findBlock(tree, tableId, blocks);
  if (table?.name !== TABLE) return tree;
  const rows = table.attrs?.rows;
  if (!isBlockNodeArray(rows) || rows.length === 0) return tree;
  const grown = rows.map((row) => {
    const name = row.name === HEADER_ROW ? HEADER_CELL : BODY_CELL;
    const cell: BlockNode = { id: freshBlockId(), name };
    return { ...row, attrs: { ...row.attrs, cells: [...cellsOf(row), cell] } };
  });
  return setTableRows(tree, tableId, grown, blocks);
}

/**
 * Append a body row to a table, with one cell per existing column so the grid
 * stays rectangular (at least one cell when the table is empty). One transform.
 * A no-op when `tableId` isn't a core/table.
 */
export function appendTableRow(
  tree: readonly BlockNode[],
  tableId: string,
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  const table = findBlock(tree, tableId, blocks);
  if (table?.name !== TABLE) return tree;
  const raw = table.attrs?.rows;
  const rows = isBlockNodeArray(raw) ? raw : [];
  const cells = Array.from(
    { length: Math.max(columnCount(rows), 1) },
    (): BlockNode => ({ id: freshBlockId(), name: BODY_CELL }),
  );
  const row: BlockNode = {
    id: freshBlockId(),
    name: BODY_ROW,
    attrs: { cells },
  };
  return setTableRows(tree, tableId, [...rows, row], blocks);
}

/**
 * Remove a table's last column — drop the trailing cell from every row. One
 * transform (a single undo step). A no-op (same tree ref) when `tableId` isn't a
 * core/table or the table is already down to a single column, so it never leaves
 * a column-less table.
 */
export function removeTableColumn(
  tree: readonly BlockNode[],
  tableId: string,
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  const table = findBlock(tree, tableId, blocks);
  if (table?.name !== TABLE) return tree;
  const rows = table.attrs?.rows;
  if (!isBlockNodeArray(rows) || columnCount(rows) <= 1) return tree;
  const shrunk = rows.map((row) => {
    const cells = cellsOf(row);
    return cells.length > 0
      ? { ...row, attrs: { ...row.attrs, cells: cells.slice(0, -1) } }
      : row;
  });
  return setTableRows(tree, tableId, shrunk, blocks);
}

/**
 * Remove a table's last row. One transform. A no-op when `tableId` isn't a
 * core/table or the table is down to a single row, so it never leaves a
 * row-less table.
 */
export function removeTableRow(
  tree: readonly BlockNode[],
  tableId: string,
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  const table = findBlock(tree, tableId, blocks);
  if (table?.name !== TABLE) return tree;
  const raw = table.attrs?.rows;
  const rows = isBlockNodeArray(raw) ? raw : [];
  if (rows.length <= 1) return tree;
  return setTableRows(tree, tableId, rows.slice(0, -1), blocks);
}

// Replace a table's `rows` slot, descending through slots so a nested table is
// reachable. Untouched branches keep their reference for React.
function setTableRows(
  nodes: readonly BlockNode[],
  tableId: string,
  rows: readonly BlockNode[],
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  return nodes.map((node) => {
    if (node.id === tableId) {
      return { ...node, attrs: { ...node.attrs, rows } };
    }
    const attrs = node.attrs;
    if (!attrs) return node;
    let nextAttrs: Record<string, JsonValue> | undefined;
    for (const key of slotKeys(node, blocks)) {
      const value = attrs[key];
      if (!isBlockNodeArray(value)) continue;
      const replaced = setTableRows(value, tableId, rows, blocks);
      if (replaced !== value) (nextAttrs ??= { ...attrs })[key] = replaced;
    }
    return nextAttrs ? { ...node, attrs: nextAttrs } : node;
  });
}

interface SiblingSlot {
  /** The blocks sharing the node's slot, the node included. */
  readonly siblings: readonly BlockNode[];
  /** The slot as a move target, missing only its index. */
  readonly at: Omit<MoveTarget, "index">;
}

function topLevelSlot(tree: readonly BlockNode[]): SiblingSlot {
  return { siblings: tree, at: { parentId: null } };
}

// The slot that directly holds `id` — whichever of its parent's slots that is,
// so an op relative to a node stays in that node's slot. An absent id resolves
// to the top level, where a sibling-relative op finds nothing to act on.
function siblingsOf(
  tree: readonly BlockNode[],
  id: string,
  blocks: BlockSpecLookup,
): SiblingSlot {
  const find = (
    nodes: readonly BlockNode[],
    at: Omit<MoveTarget, "index">,
  ): SiblingSlot | null => {
    if (nodes.some((n) => n.id === id)) return { siblings: nodes, at };
    for (const node of nodes) {
      for (const key of slotKeys(node, blocks)) {
        const slot = node.attrs?.[key];
        if (!isBlockNodeArray(slot)) continue;
        const hit = find(slot, { parentId: node.id, slotKey: key });
        if (hit) return hit;
      }
    }
    return null;
  };
  return find(tree, { parentId: null }) ?? topLevelSlot(tree);
}

function slotKeys(node: BlockNode, blocks: BlockSpecLookup): readonly string[] {
  return blockSlotKeys(node, blocks.get(node.name));
}

// The children held in each of the node's slots, in declaration order. A slot
// that is unset, or holds something other than nodes, has none to walk.
function slotChildren(
  node: BlockNode,
  blocks: BlockSpecLookup,
): (readonly BlockNode[])[] {
  const out: (readonly BlockNode[])[] = [];
  for (const key of slotKeys(node, blocks)) {
    const value = node.attrs?.[key];
    if (isBlockNodeArray(value)) out.push(value);
  }
  return out;
}

/** Whether `id` is `node` itself or anywhere in its subtree. */
function containsBlock(
  node: BlockNode,
  id: string,
  blocks: BlockSpecLookup,
): boolean {
  if (node.id === id) return true;
  return slotChildren(node, blocks).some((children) =>
    children.some((c) => containsBlock(c, id, blocks)),
  );
}

function removeNode(
  nodes: readonly BlockNode[],
  id: string,
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  return removeBlocks(nodes, new Set([id]), blocks);
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

function insertNode(
  nodes: readonly BlockNode[],
  node: BlockNode,
  target: MoveTarget,
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  if (target.parentId === null) {
    const at = clampIndex(target.index, nodes.length);
    return [...nodes.slice(0, at), node, ...nodes.slice(at)];
  }
  return nodes.map((current) => {
    if (current.id === target.parentId) {
      const key = target.slotKey ?? slotKeys(current, blocks)[0];
      if (key === undefined) return current;
      const slot = current.attrs?.[key];
      // A scalar attr is never a slot; an unset slot starts empty.
      if (slot !== undefined && !isBlockNodeArray(slot)) return current;
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
    let nextAttrs: Record<string, JsonValue> | undefined;
    for (const key of slotKeys(current, blocks)) {
      const value = attrs[key];
      if (!isBlockNodeArray(value)) continue;
      const inserted = insertNode(value, node, target, blocks);
      if (inserted !== value) (nextAttrs ??= { ...attrs })[key] = inserted;
    }
    return nextAttrs ? { ...current, attrs: nextAttrs } : current;
  });
}
