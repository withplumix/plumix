import { createStore } from "zustand/vanilla";

import type {
  BlockNode,
  InsertableBlockEntry,
  ResponsiveStyleBucket,
  ResponsiveStyleSlot,
  StyleValue,
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
import { clampZoom, zoomToCursor } from "./canvas-view.js";
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
  readonly zoom: number;
  /** X-ray view: when on, the canvas outlines every block. Transient view
   *  state (like zoom), not persisted to the document. */
  readonly xray: boolean;
  /** Free-canvas pan offset (px, host/container space) of the device frame's
   *  top-left. The canvas is a Figma-style pannable stage, not a scroll area. */
  readonly panX: number;
  readonly panY: number;
  /** The canvas viewport size, mirrored from the host so view actions
   *  (zoom-to-center) can do their math without the DOM. */
  readonly viewportW: number;
  readonly viewportH: number;
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
  /** Active tab in the right inspector rail. */
  readonly rightPanel: RightPanel;
  /** Whether the read-only JSON source dialog is open (header's source-code
   *  action opens it). */
  readonly jsonOpen: boolean;
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
  /** Set (or clear, with `null`) one style property in a block's responsive
   *  bucket, anywhere in the tree. Empty buckets / style are pruned. */
  updateBlockStyle: (
    id: string,
    bucket: StyleBucket,
    property: string,
    value: StyleValue | null,
  ) => void;
  /** Rename one style property in a block's bucket, keeping its value and
   *  position. No-op when the source is missing or the target name is taken. */
  renameBlockStyleProperty: (
    id: string,
    bucket: StyleBucket,
    from: string,
    to: string,
  ) => void;
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
  /** Select the active block's container, walking one level up. */
  selectParent: () => void;
  /** Move the active block by `delta` positions among its siblings. */
  moveSelectedBy: (delta: number) => void;
  setHover: (id: string | null) => void;
  /** Switch device; re-enables fit-to-width so the new width fits the viewport. */
  setDevice: (device: EditorDevice) => void;
  /** Flip the X-ray (outline-all-blocks) view. */
  toggleXray: () => void;
  setRightPanel: (panel: RightPanel) => void;
  setJsonOpen: (open: boolean) => void;
  /** Set (or clear, with an empty string) a block's Layers-tree instance name. */
  setBlockLabel: (id: string, label: string) => void;
  /** Re-enable fit-to-width (the toolbar's "Fit" action). Also recenters. */
  enableZoomFit: () => void;
  /** Pan the free canvas to an absolute offset (canvas-driven; clamped by the
   *  caller to keep the frame on-screen). A manual pan leaves fit mode. */
  setPan: (panX: number, panY: number) => void;
  /** Set zoom + pan atomically (zoom-to-cursor keeps a focal point fixed).
   *  Leaves fit mode — it's a manual gesture. */
  setView: (view: {
    readonly zoom: number;
    readonly panX: number;
    readonly panY: number;
  }) => void;
  /** Mirror the host canvas viewport size so view actions can do their math. */
  setViewport: (width: number, height: number) => void;
  /** Zoom keeping the viewport center's point fixed (the toolbar +/- buttons,
   *  vs. the wheel's zoom-to-cursor). Leaves fit mode. */
  zoomToCenter: (zoom: number) => void;
  /** Center + fit the frame in the viewport (canvas-driven, stays in fit mode).
   *  This is how a device switch re-lands the frame on-screen. */
  applyFitView: (view: {
    readonly zoom: number;
    readonly panX: number;
    readonly panY: number;
  }) => void;
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
  value: StyleValue | null,
): BlockNode {
  const slot: ResponsiveStyleSlot = node.style ?? {};
  const current: ResponsiveStyleBucket = slot[bucket] ?? {};
  let nextBucket: Record<string, StyleValue | string>;
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
  const nextBucket: Record<string, StyleValue | string> = {};
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
    xray: false,
    zoom: initial?.zoom ?? 1,
    panX: 0,
    panY: 0,
    viewportW: 0,
    viewportH: 0,
    breakpoints: initial?.breakpoints ?? DEFAULT_BREAKPOINTS,
    zoomFit: true,
    dragSpec: null,
    movingId: null,
    history: initHistory(initial?.tree ?? []),
    rightPanel: "block",
    jsonOpen: false,

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
        const tree = mapNodeById(state.tree, id, (node) => ({
          ...node,
          attrs: { ...node.attrs, ...patch },
        }));
        if (tree === state.tree) return {};
        // Coalesce a typing burst on one field into a single undo step.
        const key = `attr:${id}:${Object.keys(patch).sort().join(",")}`;
        return { tree, history: recordHistory(state.history, tree, key) };
      }),
    setBlockLabel: (id, rawLabel) =>
      set((state) => {
        const label = rawLabel.trim() || undefined;
        const tree = mapNodeById(state.tree, id, (node) => ({
          ...node,
          label,
        }));
        if (tree === state.tree) return {};
        // Coalesce a rename's keystrokes into one undo step.
        return {
          tree,
          history: recordHistory(state.history, tree, `label:${id}`),
        };
      }),
    updateBlockStyle: (id, bucket, property, value) =>
      set((state) => {
        const tree = mapNodeById(state.tree, id, (node) =>
          setNodeStyle(node, bucket, property, value),
        );
        if (tree === state.tree) return {};
        // Coalesce edits to one property+bucket (e.g. typing a raw value).
        const key = `style:${id}:${bucket}:${property}`;
        return { tree, history: recordHistory(state.history, tree, key) };
      }),
    renameBlockStyleProperty: (id, bucket, from, to) =>
      set((state) => {
        const tree = mapNodeById(state.tree, id, (node) =>
          renameNodeStyleProperty(node, bucket, from, to),
        );
        if (tree === state.tree) return {};
        // A blur-committed rename is one atomic action — never coalesced.
        return { tree, history: recordHistory(state.history, tree, null) };
      }),
    updateBlockHtmlAttr: (id, key, value) =>
      set((state) => {
        const tree = mapNodeById(state.tree, id, (node) =>
          setNodeHtmlAttr(node, key, value),
        );
        if (tree === state.tree) return {};
        // Coalesce keystrokes for one attribute into a single undo step.
        const coalesceKey = `htmlattr:${id}:${key}`;
        return {
          tree,
          history: recordHistory(state.history, tree, coalesceKey),
        };
      }),
    renameBlockHtmlAttr: (id, from, to) =>
      set((state) => {
        const tree = mapNodeById(state.tree, id, (node) =>
          renameNodeHtmlAttr(node, from, to),
        );
        if (tree === state.tree) return {};
        return { tree, history: recordHistory(state.history, tree, null) };
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
    toggleXray: () => set((s) => ({ xray: !s.xray })),
    setRightPanel: (rightPanel) => set({ rightPanel }),
    setJsonOpen: (jsonOpen) => set({ jsonOpen }),
    enableZoomFit: () => set({ zoomFit: true }),
    setPan: (panX, panY) => set({ panX, panY, zoomFit: false }),
    setView: ({ zoom, panX, panY }) =>
      set({ zoom: clampZoom(zoom), panX, panY, zoomFit: false }),
    applyFitView: ({ zoom, panX, panY }) =>
      set({ zoom: clampZoom(zoom), panX, panY }),
    setViewport: (width, height) =>
      set((s) =>
        s.viewportW === width && s.viewportH === height
          ? {}
          : { viewportW: width, viewportH: height },
      ),
    zoomToCenter: (zoom) =>
      set((s) => {
        const next = clampZoom(zoom);
        if (next === s.zoom) return {};
        if (s.viewportW === 0) return { zoom: next, zoomFit: false };
        // Zoom keeping the viewport center fixed (vs. the wheel's cursor).
        const view = zoomToCursor(
          { zoom: s.zoom, panX: s.panX, panY: s.panY },
          next,
          s.viewportW / 2,
          s.viewportH / 2,
        );
        return { ...view, zoomFit: false };
      }),
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
