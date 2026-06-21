import { createStore } from "zustand/vanilla";

import type {
  BlockNode,
  InsertableBlockEntry,
  ThemeBreakpoints,
} from "@plumix/blocks";
import { DEFAULT_BREAKPOINTS, isBlockNodeArray } from "@plumix/blocks";

import type { MoveTarget } from "./block-tree-ops.js";
import type { History } from "./history.js";
import {
  duplicateBlock,
  findParentId,
  insertBlockAt,
  moveBlockBy,
  moveBlock as moveBlockOp,
  removeBlocks,
  selectionRoots,
} from "./block-tree-ops.js";
import { initHistory, recordHistory, redo, undo } from "./history.js";

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

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

const clampZoom = (zoom: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export interface EditorState {
  /** Canonical block tree — the single source of truth pushed to the canvas. */
  readonly tree: readonly BlockNode[];
  readonly selectedIds: ReadonlySet<string>;
  /** Last-clicked block; the inspector edits this one when several are selected. */
  readonly activeId: string | null;
  readonly hoverId: string | null;
  readonly device: EditorDevice;
  readonly zoom: number;
  /** Theme breakpoints driving the device canvas widths. */
  readonly breakpoints: ThemeBreakpoints;
  /** When true, zoom auto-fits the canvas to the viewport width; a manual zoom
   *  clears it until the device changes or fit is re-enabled. */
  readonly zoomFit: boolean;
  /** The catalog entry (block or variation) being dragged toward the canvas. */
  readonly dragSpec: InsertableBlockEntry | null;
  /** The existing block being dragged to a new position on the canvas, if any. */
  readonly movingId: string | null;
  /** Snapshot history of the tree, driving undo/redo. */
  readonly history: TreeHistory;
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
  /** Merge a partial attrs patch into one block, anywhere in the tree. */
  updateBlockAttrs: (
    id: string,
    patch: Readonly<Record<string, unknown>>,
  ) => void;
  select: (id: string, options?: { readonly additive?: boolean }) => void;
  clearSelection: () => void;
  /** Delete every selected block (bulk) and clear the selection. */
  removeSelected: () => void;
  /** Clone every selected block after itself and select the clones (bulk). */
  duplicateSelected: () => void;
  /** Select the active block's container, walking one level up. */
  selectParent: () => void;
  /** Move the active block by `delta` positions among its siblings. */
  moveSelectedBy: (delta: number) => void;
  setHover: (id: string | null) => void;
  /** Switch device; re-enables fit-to-width so the new width fits the viewport. */
  setDevice: (device: EditorDevice) => void;
  /** Manual zoom — pins the level and turns off fit-to-width. */
  setZoom: (zoom: number) => void;
  /** Apply a computed fit-to-width zoom without leaving fit mode (canvas-driven). */
  applyFitZoom: (zoom: number) => void;
  /** Re-enable fit-to-width (the toolbar's "Fit" action). */
  enableZoomFit: () => void;
  startBlockDrag: (entry: InsertableBlockEntry) => void;
  endBlockDrag: () => void;
  /** Begin / end dragging an existing block to a new canvas position. */
  startMove: (id: string) => void;
  endMove: () => void;
  /** Restore the previous / next tree snapshot. */
  undo: () => void;
  redo: () => void;
}

// Merge `patch` into one node, returning the same reference when nothing
// changed. Descends into slot attrs (any attr whose value is a BlockNode[]),
// so a nested target is reachable and untouched branches stay stable.
function patchNode(
  node: BlockNode,
  id: string,
  patch: Readonly<Record<string, unknown>>,
): BlockNode {
  if (node.id === id) {
    return { ...node, attrs: { ...node.attrs, ...patch } };
  }
  const attrs = node.attrs;
  if (!attrs) return node;
  let nextAttrs: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(attrs)) {
    if (!isBlockNodeArray(value)) continue;
    const patched = patchAttrs(value, id, patch);
    if (patched !== value) {
      (nextAttrs ??= { ...attrs })[key] = patched;
    }
  }
  return nextAttrs ? { ...node, attrs: nextAttrs } : node;
}

// Rebuild the tree with `patch` applied to the node with `id`. Returns the
// same array reference when nothing changed so React skips untouched branches.
function patchAttrs(
  nodes: readonly BlockNode[],
  id: string,
  patch: Readonly<Record<string, unknown>>,
): readonly BlockNode[] {
  const next = nodes.map((node) => patchNode(node, id, patch));
  return next.some((node, i) => node !== nodes[i]) ? next : nodes;
}

export type EditorStore = EditorState & EditorActions;

export type EditorStoreApi = ReturnType<typeof createEditorStore>;

export function createEditorStore(
  initial?: Partial<
    Pick<EditorState, "tree" | "device" | "zoom" | "breakpoints">
  >,
) {
  return createStore<EditorStore>((set) => ({
    tree: initial?.tree ?? [],
    selectedIds: new Set<string>(),
    activeId: null,
    hoverId: null,
    device: initial?.device ?? "desktop",
    zoom: initial?.zoom ?? 1,
    breakpoints: initial?.breakpoints ?? DEFAULT_BREAKPOINTS,
    zoomFit: true,
    dragSpec: null,
    movingId: null,
    history: initHistory(initial?.tree ?? []),

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
        return {
          tree,
          activeId: node.id,
          selectedIds: new Set([node.id]),
          history: recordHistory(state.history, tree, null),
        };
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
        return {
          tree,
          activeId: first.id,
          selectedIds: new Set([first.id]),
          history: recordHistory(state.history, tree, null),
        };
      }),
    insertBlockInto: (node, target, allowed) =>
      set((state) => {
        const tree = insertBlockAt(state.tree, node, target, allowed);
        if (tree === state.tree) return {};
        return {
          tree,
          activeId: node.id,
          selectedIds: new Set([node.id]),
          history: recordHistory(state.history, tree, null),
        };
      }),
    moveBlock: (sourceId, target, allowed) =>
      set((state) => {
        const tree = moveBlockOp(state.tree, sourceId, target, allowed);
        if (tree === state.tree) return {};
        return { tree, history: recordHistory(state.history, tree, null) };
      }),
    updateBlockAttrs: (id, patch) =>
      set((state) => {
        const tree = patchAttrs(state.tree, id, patch);
        if (tree === state.tree) return {};
        // Coalesce a typing burst on one field into a single undo step.
        const key = `attr:${id}:${Object.keys(patch).sort().join(",")}`;
        return { tree, history: recordHistory(state.history, tree, key) };
      }),
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
      set((state) => {
        const tree = removeBlocks(state.tree, state.selectedIds);
        if (tree === state.tree) return {};
        return {
          tree,
          selectedIds: new Set(),
          activeId: null,
          history: recordHistory(state.history, tree, null),
        };
      }),
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
        if (tree === state.tree) return {};
        return {
          tree,
          selectedIds: new Set(newIds),
          activeId: newIds.at(-1) ?? null,
          history: recordHistory(state.history, tree, null),
        };
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
        const tree = moveBlockBy(state.tree, state.activeId, delta);
        if (tree === state.tree) return {};
        return { tree, history: recordHistory(state.history, tree, null) };
      }),
    setHover: (hoverId) => set({ hoverId }),
    setDevice: (device) => set({ device, zoomFit: true }),
    setZoom: (zoom) => set({ zoom: clampZoom(zoom), zoomFit: false }),
    applyFitZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
    enableZoomFit: () => set({ zoomFit: true }),
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
