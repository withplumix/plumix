import { createStore } from "zustand/vanilla";

import type {
  BlockNode,
  InsertableBlockEntry,
  ResponsiveStyleBucket,
  ResponsiveStyleSlot,
  ThemeBreakpoints,
  VisibilityFlags,
} from "@plumix/blocks";
import {
  DEFAULT_BREAKPOINTS,
  freshBlockId,
  isBlockNodeArray,
} from "@plumix/blocks";

import type { MoveTarget } from "./block-tree-ops.js";
import type { History } from "./history.js";
import {
  appendTableColumn,
  appendTableRow,
  duplicateBlock,
  findParentId,
  groupBlocks,
  insertBlockAt,
  moveBlockBy,
  moveBlock as moveBlockOp,
  pasteBlocks as pasteBlocksOp,
  removeBlocks,
  removeTableColumn,
  removeTableRow,
  selectionRoots,
  ungroupBlock,
} from "./block-tree-ops.js";
import { initHistory, recordHistory, redo, undo } from "./history.js";

/** The responsive bucket a style edit targets (per active device). */
export type StyleBucket = "large" | "medium" | "small";

/** The style bucket the active device edits: desktop is the base (large),
 *  tablet/mobile narrow to the medium/small @media buckets. */
export function deviceBucket(device: EditorDevice): StyleBucket {
  if (device === "tablet") return "medium";
  if (device === "mobile") return "small";
  return "large";
}

type TreeHistory = History<readonly BlockNode[]>;

export type EditorDevice = "desktop" | "tablet" | "mobile";

// Desktop has no breakpoint (the large bucket has no @media), so its canvas
// width is a fixed comfortable default; tablet/mobile track the theme
// breakpoints so the canvas width equals the viewport where that bucket applies
// (preview equals shipped).
export const DESKTOP_CANVAS_WIDTH = 1280;

/** The canvas width for a device: desktop is fixed; tablet/mobile use the
 *  theme's breakpoint thresholds. */
export function deviceWidth(
  device: EditorDevice,
  breakpoints: ThemeBreakpoints,
): number {
  if (device === "tablet") return breakpoints.tablet;
  if (device === "mobile") return breakpoints.mobile;
  return DESKTOP_CANVAS_WIDTH;
}

// Re-exported for the package's public surface (index.ts) and consumers; the
// zoom range + view math live in canvas-view.
export { MAX_ZOOM, MIN_ZOOM } from "./canvas-view.js";

/** The active tab in the right inspector rail. */
export type RightPanel = "block" | "styles" | "page";

export interface EditorState {
  /** Canonical block tree — the single source of truth pushed to the canvas. */
  readonly tree: readonly BlockNode[];
  readonly selectedIds: ReadonlySet<string>;
  /** Last-clicked block; the inspector edits this one when several are selected. */
  readonly activeId: string | null;
  readonly hoverId: string | null;
  readonly device: EditorDevice;
  /** X-ray view: when on, the canvas outlines every block. Transient view
   *  state, not persisted to the document. */
  readonly xray: boolean;
  /** Theme breakpoints driving the device canvas widths. */
  readonly breakpoints: ThemeBreakpoints;
  /** The catalog entry (block or variation) being dragged toward the canvas. */
  readonly dragSpec: InsertableBlockEntry | null;
  /** The existing block being dragged to a new position on the canvas, if any. */
  readonly movingId: string | null;
  /** Snapshot history of the tree, driving undo/redo. */
  readonly history: TreeHistory;
  /** Active tab in the right inspector rail. */
  readonly rightPanel: RightPanel;
  /** Whether the read-only JSON source dialog is open (header's source-code
   *  action opens it). */
  readonly jsonOpen: boolean;
  /** Whether the starter-pattern picker is open. Seeded true for a blank entry
   *  that has eligible starters; re-openable from the toolbar while empty. */
  readonly starterOpen: boolean;
}

export interface EditorActions {
  setTree: (tree: readonly BlockNode[]) => void;
  /** Insert a block at a top-level index (clamped) and select it. */
  insertBlock: (node: BlockNode, index: number) => void;
  /** Insert several blocks at a top-level index as one step (a pattern's
   *  composition); selects the first. No-op for an empty list. */
  insertBlocks: (nodes: readonly BlockNode[], index: number) => void;
  /** Insert a block into a parent's slot (nested), gated by `allowed`, and
   *  select it. A no-op when the slot is absent or the block isn't allowed. */
  insertBlockInto: (
    node: BlockNode,
    target: MoveTarget,
    allowed?: readonly string[],
  ) => void;
  /** Move a block to a new parent + slot + index (reorder / nest / un-nest),
   *  gated by an optional `allowed` (the target slot's allowedBlocks). */
  moveBlock: (
    sourceId: string,
    target: MoveTarget,
    allowed?: readonly string[],
  ) => void;
  /** Append a column to a table — a cell to the end of every row — as one undo
   *  step. No-op when the id isn't a table or the table has no rows. */
  addTableColumn: (tableId: string) => void;
  /** Append a body row to a table, sized to its current column count, as one
   *  undo step. No-op when the id isn't a table. */
  addTableRow: (tableId: string) => void;
  /** Remove a table's last column (the trailing cell of every row) as one undo
   *  step. No-op when the id isn't a table or only one column remains. */
  removeTableColumn: (tableId: string) => void;
  /** Remove a table's last row as one undo step. No-op when the id isn't a table
   *  or only one row remains. */
  removeTableRow: (tableId: string) => void;
  /** Merge a partial attrs patch into one block, anywhere in the tree. */
  updateBlockAttrs: (
    id: string,
    patch: Readonly<Record<string, unknown>>,
  ) => void;
  /** Set (or clear, with `null`) one style property in a block's responsive
   *  bucket, anywhere in the tree. Empty buckets / style are pruned. */
  updateBlockStyle: (
    id: string,
    bucket: StyleBucket,
    property: string,
    value: string | null,
  ) => void;
  /** Set or clear one device's visibility flag on a block. Stored off the style
   *  slot (in `hidden`) so hiding never overwrites a bucket's layout `display`;
   *  clearing restores it. Empty `hidden` is pruned. */
  updateBlockHidden: (id: string, bucket: StyleBucket, hidden: boolean) => void;
  /** Rename one style property in a block's bucket, keeping its value and
   *  position. No-op when the source is missing or the target name is taken. */
  renameBlockStyleProperty: (
    id: string,
    bucket: StyleBucket,
    from: string,
    to: string,
  ) => void;
  /** Set (or clear, with an empty string) a block's root-element override
   *  (Builder's tag-name). Allowlisted at render (`resolveRootTag`). */
  setBlockTagName: (id: string, tagName: string) => void;
  /** Set (or clear, with a blank string) a block's author CSS class names
   *  (space-separated). Merged onto the block root at render. */
  setBlockClassName: (id: string, className: string) => void;
  /** Set (or clear, with `null`) one HTML attribute on a block. Flat (not
   *  responsive); empty `htmlAttrs` is pruned. Allowlisted at render. */
  updateBlockHtmlAttr: (id: string, key: string, value: string | null) => void;
  /** Rename one HTML attribute in place, keeping its value and position.
   *  No-op when the source is missing or the target name is taken. */
  renameBlockHtmlAttr: (id: string, from: string, to: string) => void;
  select: (id: string, options?: { readonly additive?: boolean }) => void;
  clearSelection: () => void;
  /** Delete every selected block (bulk) and clear the selection. */
  removeSelected: () => void;
  /** Clone every selected block after itself and select the clones (bulk). */
  duplicateSelected: () => void;
  /** Insert fresh-id clones of `nodes` after the active block (or appended to
   *  the root), then select them. Used by clipboard paste. */
  pasteBlocks: (nodes: readonly BlockNode[]) => void;
  /** Wrap the selected sibling blocks in a new `core/group` and select it.
   *  No-op when the selection is empty or spans different parents. */
  groupSelected: () => void;
  /** Replace the active block with its children (ungroup) and select them.
   *  No-op when the active block has no children. */
  ungroupSelected: () => void;
  /** Select the active block's container, walking one level up. */
  selectParent: () => void;
  /** Move the active block by `delta` positions among its siblings. */
  moveSelectedBy: (delta: number) => void;
  setHover: (id: string | null) => void;
  /** Switch device. The camera re-enters fit mode (a one-way notification wired
   *  in the provider) so the new frame width re-fits the viewport. */
  setDevice: (device: EditorDevice) => void;
  /** Flip the X-ray (outline-all-blocks) view. */
  toggleXray: () => void;
  setRightPanel: (panel: RightPanel) => void;
  setJsonOpen: (open: boolean) => void;
  setStarterOpen: (open: boolean) => void;
  /** Set (or clear, with an empty string) a block's Layers-tree instance name. */
  setBlockLabel: (id: string, label: string) => void;
  startBlockDrag: (entry: InsertableBlockEntry) => void;
  endBlockDrag: () => void;
  /** Begin / end dragging an existing block to a new canvas position. */
  startMove: (id: string) => void;
  endMove: () => void;
  /** Restore the previous / next tree snapshot. */
  undo: () => void;
  redo: () => void;
}

// Rebuild the tree with `transform` applied to the node carrying `id`,
// descending into slot attrs (any attr whose value is a BlockNode[]) so a
// nested target is reachable. Untouched branches — and the whole tree when
// nothing changed — keep their reference, so React skips them.
function mapNodeById(
  nodes: readonly BlockNode[],
  id: string,
  transform: (node: BlockNode) => BlockNode,
): readonly BlockNode[] {
  const next = nodes.map((node) => mapNode(node, id, transform));
  return next.some((node, i) => node !== nodes[i]) ? next : nodes;
}

function mapNode(
  node: BlockNode,
  id: string,
  transform: (node: BlockNode) => BlockNode,
): BlockNode {
  if (node.id === id) return transform(node);
  const attrs = node.attrs;
  if (!attrs) return node;
  let nextAttrs: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(attrs)) {
    if (!isBlockNodeArray(value)) continue;
    const patched = mapNodeById(value, id, transform);
    if (patched !== value) (nextAttrs ??= { ...attrs })[key] = patched;
  }
  return nextAttrs ? { ...node, attrs: nextAttrs } : node;
}

// Set/clear one style property on a single node, pruning an emptied bucket and
// an emptied style slot. Returns the same reference when nothing changed. Raw
// values are sanitized at emit time (the SSR emitter), not here.
function setNodeStyle(
  node: BlockNode,
  bucket: StyleBucket,
  property: string,
  value: string | null,
): BlockNode {
  const slot: ResponsiveStyleSlot = node.style ?? {};
  const current: ResponsiveStyleBucket = slot[bucket] ?? {};
  let nextBucket: Record<string, string>;
  if (value === null) {
    if (!(property in current)) return node;
    const { [property]: _dropped, ...rest } = current;
    nextBucket = rest;
  } else {
    nextBucket = { ...current, [property]: value };
  }
  const nextSlot: Record<string, ResponsiveStyleBucket> = { ...slot };
  if (Object.keys(nextBucket).length === 0) delete nextSlot[bucket];
  else nextSlot[bucket] = nextBucket;
  const style =
    Object.keys(nextSlot).length === 0
      ? undefined
      : (nextSlot as ResponsiveStyleSlot);
  return { ...node, style };
}

// Set/clear one device's visibility flag, pruning an emptied `hidden`. Kept off
// the style slot so it never touches a bucket's layout `display`. Returns the
// same reference when nothing changed.
function setNodeHidden(
  node: BlockNode,
  bucket: StyleBucket,
  hidden: boolean,
): BlockNode {
  const current: VisibilityFlags = node.hidden ?? {};
  if (Boolean(current[bucket]) === hidden) return node;
  const next: Record<string, boolean> = { ...current };
  if (hidden) next[bucket] = true;
  else delete next[bucket];
  const nextHidden =
    Object.keys(next).length === 0 ? undefined : (next as VisibilityFlags);
  return { ...node, hidden: nextHidden };
}

// Rename one property in a bucket, rebuilding it so the renamed key holds its
// old position (a fresh `{ ...bucket, [to]: ... }` would move it to the end).
// Returns the same reference when the source is missing or the target is taken.
function renameNodeStyleProperty(
  node: BlockNode,
  bucket: StyleBucket,
  from: string,
  to: string,
): BlockNode {
  const slot: ResponsiveStyleSlot = node.style ?? {};
  const current: ResponsiveStyleBucket = slot[bucket] ?? {};
  // Covers from===to too: the source key is then also the (taken) target.
  if (!(from in current) || to in current) return node;
  const nextBucket: Record<string, string> = {};
  for (const [key, val] of Object.entries(current)) {
    nextBucket[key === from ? to : key] = val;
  }
  const nextSlot: Record<string, ResponsiveStyleBucket> = { ...slot };
  nextSlot[bucket] = nextBucket;
  return { ...node, style: nextSlot };
}

// Set/clear one HTML attribute on a node, pruning an emptied htmlAttrs. Flat
// (not responsive). Values are allowlisted at render, not here.
function setNodeHtmlAttr(
  node: BlockNode,
  key: string,
  value: string | null,
): BlockNode {
  const current: Readonly<Record<string, string>> = node.htmlAttrs ?? {};
  let next: Record<string, string>;
  if (value === null) {
    if (!(key in current)) return node;
    const { [key]: _dropped, ...rest } = current;
    next = rest;
  } else {
    next = { ...current, [key]: value };
  }
  const htmlAttrs = Object.keys(next).length === 0 ? undefined : next;
  return { ...node, htmlAttrs };
}

// Rename one HTML attribute in place, keeping its value + position. No-op when
// the source is missing or the target is taken (mirrors the style rename).
function renameNodeHtmlAttr(
  node: BlockNode,
  from: string,
  to: string,
): BlockNode {
  const current: Readonly<Record<string, string>> = node.htmlAttrs ?? {};
  if (!(from in current) || to in current) return node;
  const next: Record<string, string> = {};
  for (const [key, val] of Object.entries(current)) {
    next[key === from ? to : key] = val;
  }
  return { ...node, htmlAttrs: next };
}

export type EditorStore = EditorState & EditorActions;

export type EditorStoreApi = ReturnType<typeof createEditorStore>;

// The store's single definition of "how a tree edit is committed": an unchanged
// tree reference is a no-op; otherwise the new tree is recorded in history
// (coalesced under `coalesceKey` when given, so a keystroke burst folds into one
// undo step). Internal to the store — not part of its interface.
function commitTree(
  state: EditorState,
  tree: readonly BlockNode[],
  coalesceKey: string | null = null,
): Partial<EditorState> {
  if (tree === state.tree) return {};
  return { tree, history: recordHistory(state.history, tree, coalesceKey) };
}

// Commit a tree edit that also moves the selection (insert/remove/duplicate/…).
// The selection only shifts when the commit is non-empty, so an unchanged tree
// leaves the selection untouched — same no-op rule as commitTree.
function commitTreeWithSelection(
  state: EditorState,
  tree: readonly BlockNode[],
  selection: Pick<EditorState, "selectedIds" | "activeId">,
): Partial<EditorState> {
  const committed = commitTree(state, tree);
  return "tree" in committed ? { ...committed, ...selection } : committed;
}

export function createEditorStore(
  initial?: Partial<
    Pick<EditorState, "tree" | "device" | "breakpoints" | "starterOpen">
  >,
) {
  return createStore<EditorStore>((set) => ({
    tree: initial?.tree ?? [],
    selectedIds: new Set<string>(),
    activeId: null,
    hoverId: null,
    device: initial?.device ?? "desktop",
    xray: false,
    breakpoints: initial?.breakpoints ?? DEFAULT_BREAKPOINTS,
    dragSpec: null,
    movingId: null,
    history: initHistory(initial?.tree ?? []),
    rightPanel: "block",
    jsonOpen: false,
    starterOpen: initial?.starterOpen ?? false,

    // Raw seed/programmatic setter — intentionally does not record history
    // (user edits go through insert/move/updateBlockAttrs).
    setTree: (tree) => set({ tree }),
    insertBlock: (node, index) =>
      set((state) => {
        const at = Math.max(0, Math.min(index, state.tree.length));
        const tree = [
          ...state.tree.slice(0, at),
          node,
          ...state.tree.slice(at),
        ];
        return commitTreeWithSelection(state, tree, {
          selectedIds: new Set([node.id]),
          activeId: node.id,
        });
      }),
    insertBlocks: (nodes, index) =>
      set((state) => {
        const first = nodes[0];
        if (!first) return {};
        const at = Math.max(0, Math.min(index, state.tree.length));
        const tree = [
          ...state.tree.slice(0, at),
          ...nodes,
          ...state.tree.slice(at),
        ];
        return commitTreeWithSelection(state, tree, {
          selectedIds: new Set([first.id]),
          activeId: first.id,
        });
      }),
    insertBlockInto: (node, target, allowed) =>
      set((state) =>
        commitTreeWithSelection(
          state,
          insertBlockAt(state.tree, node, target, allowed),
          { selectedIds: new Set([node.id]), activeId: node.id },
        ),
      ),
    moveBlock: (sourceId, target, allowed) =>
      set((state) =>
        commitTree(state, moveBlockOp(state.tree, sourceId, target, allowed)),
      ),
    // Keep the table selected (activeId unchanged) so its inspector buttons stay
    // put for repeated clicks, unlike a single-block insert that selects itself.
    addTableColumn: (tableId) =>
      set((state) => commitTree(state, appendTableColumn(state.tree, tableId))),
    addTableRow: (tableId) =>
      set((state) => commitTree(state, appendTableRow(state.tree, tableId))),
    removeTableColumn: (tableId) =>
      set((state) => commitTree(state, removeTableColumn(state.tree, tableId))),
    removeTableRow: (tableId) =>
      set((state) => commitTree(state, removeTableRow(state.tree, tableId))),
    updateBlockAttrs: (id, patch) =>
      set((state) =>
        commitTree(
          state,
          mapNodeById(state.tree, id, (node) => ({
            ...node,
            attrs: { ...node.attrs, ...patch },
          })),
          // Coalesce a typing burst on one field into a single undo step.
          `attr:${id}:${Object.keys(patch).sort().join(",")}`,
        ),
      ),
    setBlockLabel: (id, rawLabel) =>
      set((state) => {
        const label = rawLabel.trim() || undefined;
        return commitTree(
          state,
          mapNodeById(state.tree, id, (node) => ({ ...node, label })),
          // Coalesce a rename's keystrokes into one undo step.
          `label:${id}`,
        );
      }),
    updateBlockStyle: (id, bucket, property, value) =>
      set((state) =>
        commitTree(
          state,
          mapNodeById(state.tree, id, (node) =>
            setNodeStyle(node, bucket, property, value),
          ),
          // Coalesce edits to one property+bucket (e.g. typing a raw value).
          `style:${id}:${bucket}:${property}`,
        ),
      ),
    updateBlockHidden: (id, bucket, hidden) =>
      set((state) =>
        commitTree(
          state,
          mapNodeById(state.tree, id, (node) =>
            setNodeHidden(node, bucket, hidden),
          ),
          // Each device toggle is one discrete action — never coalesced.
          `hidden:${id}:${bucket}`,
        ),
      ),
    renameBlockStyleProperty: (id, bucket, from, to) =>
      // A blur-committed rename is one atomic action — never coalesced.
      set((state) =>
        commitTree(
          state,
          mapNodeById(state.tree, id, (node) =>
            renameNodeStyleProperty(node, bucket, from, to),
          ),
        ),
      ),
    setBlockTagName: (id, rawTagName) =>
      set((state) => {
        const tagName = rawTagName.trim() || undefined;
        // Each Select choice is one discrete action — never coalesced (unlike
        // the label rename's keystroke burst).
        return commitTree(
          state,
          mapNodeById(state.tree, id, (node) => ({ ...node, tagName })),
        );
      }),
    setBlockClassName: (id, rawClassName) =>
      set((state) => {
        const className = rawClassName.trim() || undefined;
        return commitTree(
          state,
          mapNodeById(state.tree, id, (node) => ({ ...node, className })),
          // Coalesce a typing burst in the classes field into one undo step.
          `class:${id}`,
        );
      }),
    updateBlockHtmlAttr: (id, key, value) =>
      set((state) =>
        commitTree(
          state,
          mapNodeById(state.tree, id, (node) =>
            setNodeHtmlAttr(node, key, value),
          ),
          // Coalesce keystrokes for one attribute into a single undo step.
          `htmlattr:${id}:${key}`,
        ),
      ),
    renameBlockHtmlAttr: (id, from, to) =>
      set((state) =>
        commitTree(
          state,
          mapNodeById(state.tree, id, (node) =>
            renameNodeHtmlAttr(node, from, to),
          ),
        ),
      ),
    select: (id, options) =>
      set((state) => {
        if (!options?.additive) {
          return { selectedIds: new Set([id]), activeId: id };
        }
        // Additive: toggle membership. Removing the active block repoints
        // active to another remaining member (or null when the set empties).
        const selectedIds = new Set(state.selectedIds);
        if (selectedIds.delete(id)) {
          const activeId =
            state.activeId === id
              ? ([...selectedIds].at(-1) ?? null)
              : state.activeId;
          return { selectedIds, activeId };
        }
        selectedIds.add(id);
        return { selectedIds, activeId: id };
      }),
    clearSelection: () => set({ selectedIds: new Set(), activeId: null }),
    removeSelected: () =>
      set((state) =>
        commitTreeWithSelection(
          state,
          removeBlocks(state.tree, state.selectedIds),
          { selectedIds: new Set(), activeId: null },
        ),
      ),
    duplicateSelected: () =>
      set((state) => {
        let tree = state.tree;
        const newIds: string[] = [];
        // Only clone selection roots; a nested block whose container is also
        // selected is already copied inside that container's clone.
        for (const id of selectionRoots(tree, state.selectedIds)) {
          const result = duplicateBlock(tree, id);
          tree = result.tree;
          if (result.newId) newIds.push(result.newId);
        }
        return commitTreeWithSelection(state, tree, {
          selectedIds: new Set(newIds),
          activeId: newIds.at(-1) ?? null,
        });
      }),
    pasteBlocks: (nodes) =>
      set((state) => {
        // Paste at the top level (the open container), after the active block's
        // root ancestor — never into a nested slot, whose allowedBlocks the
        // clipboard can't honor. (Smart paste-as-sibling is a follow-up.)
        let afterId = state.activeId;
        while (afterId !== null) {
          const parent = findParentId(state.tree, afterId);
          if (parent === null) break;
          afterId = parent;
        }
        const { tree, newIds } = pasteBlocksOp(state.tree, nodes, afterId);
        return commitTreeWithSelection(state, tree, {
          selectedIds: new Set(newIds),
          activeId: newIds.at(-1) ?? null,
        });
      }),
    groupSelected: () =>
      set((state) => {
        const result = groupBlocks(
          state.tree,
          state.selectedIds,
          freshBlockId(),
        );
        if (!result) return {};
        return commitTreeWithSelection(state, result.tree, {
          selectedIds: new Set([result.groupId]),
          activeId: result.groupId,
        });
      }),
    ungroupSelected: () =>
      set((state) => {
        if (state.activeId === null) return {};
        const result = ungroupBlock(state.tree, state.activeId);
        if (!result) return {};
        return commitTreeWithSelection(state, result.tree, {
          selectedIds: new Set(result.childIds),
          activeId: result.childIds.at(-1) ?? null,
        });
      }),
    selectParent: () =>
      set((state) => {
        if (!state.activeId) return {};
        const parentId = findParentId(state.tree, state.activeId);
        if (!parentId) return {};
        return { selectedIds: new Set([parentId]), activeId: parentId };
      }),
    moveSelectedBy: (delta) =>
      set((state) => {
        if (!state.activeId) return {};
        return commitTree(
          state,
          moveBlockBy(state.tree, state.activeId, delta),
        );
      }),
    setHover: (hoverId) => set({ hoverId }),
    setDevice: (device) => set({ device }),
    toggleXray: () => set((s) => ({ xray: !s.xray })),
    setRightPanel: (rightPanel) => set({ rightPanel }),
    setJsonOpen: (jsonOpen) => set({ jsonOpen }),
    setStarterOpen: (starterOpen) => set({ starterOpen }),
    startBlockDrag: (dragSpec) => set({ dragSpec }),
    endBlockDrag: () => set({ dragSpec: null }),
    startMove: (movingId) => set({ movingId }),
    endMove: () => set({ movingId: null }),
    undo: () =>
      set((state) => {
        const history = undo(state.history);
        return { history, tree: history.present };
      }),
    redo: () =>
      set((state) => {
        const history = redo(state.history);
        return { history, tree: history.present };
      }),
  }));
}
