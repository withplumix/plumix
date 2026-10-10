import type { StoreApi } from "zustand/vanilla";
import { createStore } from "zustand/vanilla";

import type {
  BlockNode,
  BlockSpecLookup,
  InsertableBlockEntry,
  JsonObject,
  JsonValue,
  ResponsiveStyleBucket,
  ResponsiveStyleSlot,
  ThemeBreakpoints,
  VisibilityFlags,
} from "@plumix/core/blocks";
import {
  blockSlotKeys,
  DEFAULT_BREAKPOINTS,
  freshBlockId,
  isBlockNodeArray,
} from "@plumix/core/blocks";

import type { MoveTarget } from "./block-tree-ops.js";
import type { History } from "./history.js";
import {
  appendTableColumn,
  appendTableRow,
  duplicateBlock,
  findParentId,
  flattenTree,
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
import {
  canRedo,
  canUndo,
  initHistory,
  recordHistory,
  redo,
  undo,
} from "./history.js";

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

/**
 * Desktop's bucket has no @media, so its canvas width is a fixed default;
 * tablet/mobile track the theme breakpoints so the preview matches what ships.
 */
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
  /**
   * Last-clicked block; the inspector edits this one when several are selected.
   */
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
  /**
   * The existing block being dragged to a new position on the canvas, if any.
   */
  readonly movingId: string | null;
  /** Whether there is an edit to undo. */
  readonly canUndo: boolean;
  /** Whether there is an undone edit to redo. */
  readonly canRedo: boolean;
  /** Active tab in the right inspector rail. */
  readonly rightPanel: RightPanel;
  /** Whether the read-only JSON source dialog is open (header's source-code
   *  action opens it). */
  readonly jsonOpen: boolean;
  /** Whether the starter-pattern picker is open. Seeded true for a blank entry
   *  that has eligible starters; re-openable from the toolbar while empty. */
  readonly starterOpen: boolean;
  /** Whether the keyboard-shortcut cheatsheet is open (`?`, Cmd+/, or the
   *  toolbar's help button). */
  readonly shortcutsOpen: boolean;
  /** Whether the editor command palette is open (Cmd/Ctrl+K). */
  readonly paletteOpen: boolean;
  /** Bumped to ask the canvas to frame the active block. */
  readonly frameRequest: number;
}

interface EditorActions {
  insertBlock: (node: BlockNode, index: number) => void;
  /** One undo step; selects the first. No-op for an empty list. */
  insertBlocks: (nodes: readonly BlockNode[], index: number) => void;
  /** No-op when the slot is absent or the block isn't allowed. */
  insertBlockInto: (
    node: BlockNode,
    target: MoveTarget,
    allowed?: readonly string[],
  ) => void;
  moveBlock: (
    sourceId: string,
    target: MoveTarget,
    allowed?: readonly string[],
  ) => void;
  /**
   * Table edits are one undo step each, and no-ops when the id isn't a table
   * or the edit would leave no rows/columns.
   */
  addTableColumn: (tableId: string) => void;
  addTableRow: (tableId: string) => void;
  removeTableColumn: (tableId: string) => void;
  removeTableRow: (tableId: string) => void;
  updateBlockAttrs: (id: string, patch: JsonObject) => void;
  /** `null` clears; emptied buckets and style are pruned. */
  updateBlockStyle: (
    id: string,
    bucket: StyleBucket,
    property: string,
    value: string | null,
  ) => void;
  /**
   * Stored in `hidden`, not the style slot, so hiding never overwrites a
   * bucket's layout `display`.
   */
  updateBlockHidden: (id: string, bucket: StyleBucket, hidden: boolean) => void;
  /** No-op when the source is missing or the target name is taken. */
  renameBlockStyleProperty: (
    id: string,
    bucket: StyleBucket,
    from: string,
    to: string,
  ) => void;
  /** Stored unchecked; allowlisted at render. */
  setBlockTagName: (id: string, tagName: string) => void;
  setBlockClassName: (id: string, className: string) => void;
  /** Stored unchecked; allowlisted at render. */
  updateBlockHtmlAttr: (id: string, key: string, value: string | null) => void;
  /** No-op when the source is missing or the target name is taken. */
  renameBlockHtmlAttr: (id: string, from: string, to: string) => void;
  select: (id: string, options?: { readonly additive?: boolean }) => void;
  clearSelection: () => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  /** Clones get fresh ids. */
  pasteBlocks: (nodes: readonly BlockNode[]) => void;
  /** No-op when the selection is empty or spans different parents. */
  groupSelected: () => void;
  ungroupSelected: () => void;
  /** Selecting alone leaves an off-screen block off-screen. */
  revealBlock: (id: string) => void;
  selectParent: () => void;
  moveSelectedBy: (delta: number) => void;
  setHover: (id: string | null) => void;
  setDevice: (device: EditorDevice) => void;
  toggleXray: () => void;
  setRightPanel: (panel: RightPanel) => void;
  setJsonOpen: (open: boolean) => void;
  setStarterOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setBlockLabel: (id: string, label: string) => void;
  startBlockDrag: (entry: InsertableBlockEntry) => void;
  endBlockDrag: () => void;
  startMove: (id: string) => void;
  endMove: () => void;
  undo: () => void;
  redo: () => void;
}

// Untouched branches keep their reference, so React skips them.
function mapNodeById(
  nodes: readonly BlockNode[],
  id: string,
  blocks: BlockSpecLookup,
  transform: (node: BlockNode) => BlockNode,
): readonly BlockNode[] {
  const next = nodes.map((node) => mapNode(node, id, blocks, transform));
  return next.some((node, i) => node !== nodes[i]) ? next : nodes;
}

// A control echoing its value back (a rich-text field mounting) must not leave
// an undo step.
function holdsPatch(node: BlockNode, patch: JsonObject): boolean {
  return Object.entries(patch).every(
    ([key, value]) =>
      JSON.stringify(node.attrs?.[key]) === JSON.stringify(value),
  );
}

function mapNode(
  node: BlockNode,
  id: string,
  blocks: BlockSpecLookup,
  transform: (node: BlockNode) => BlockNode,
): BlockNode {
  if (node.id === id) return transform(node);
  const attrs = node.attrs;
  if (!attrs) return node;
  let nextAttrs: Record<string, JsonValue> | undefined;
  for (const key of blockSlotKeys(node, blocks.get(node.name))) {
    const value = attrs[key];
    if (!isBlockNodeArray(value)) continue;
    const patched = mapNodeById(value, id, blocks, transform);
    if (patched !== value) (nextAttrs ??= { ...attrs })[key] = patched;
  }
  return nextAttrs ? { ...node, attrs: nextAttrs } : node;
}

// Raw values are sanitized by the SSR emitter, not here.
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

// Rebuilt so the renamed key keeps its position; a spread would move it to the
// end.
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

export type EditorStoreApi = StoreApi<EditorStore>;

// The undo stack's storage format stays inside the store: consumers read
// canUndo/canRedo, so the snapshot shape can change without a public break.
interface InternalState extends EditorState {
  readonly history: TreeHistory;
}

type InternalStore = InternalState & EditorActions;

function historyState(
  history: TreeHistory,
): Pick<InternalState, "history" | "canUndo" | "canRedo"> {
  return { history, canUndo: canUndo(history), canRedo: canRedo(history) };
}

// An unchanged tree reference is a no-op; `coalesceKey` folds a keystroke burst
// into one undo step.
function commitTree(
  state: InternalState,
  tree: readonly BlockNode[],
  coalesceKey: string | null = null,
): Partial<InternalState> {
  if (tree === state.tree) return {};
  return {
    tree,
    ...historyState(recordHistory(state.history, tree, coalesceKey)),
  };
}

// History snapshots only the tree, so a restored tree can lack blocks the
// selection still names.
function restoreTree(
  state: InternalState,
  history: TreeHistory,
  blocks: BlockSpecLookup,
): Partial<InternalState> {
  if (history === state.history) return {};
  const tree = history.present;
  const present = new Set(flattenTree(tree, blocks).map((n) => n.id));
  const kept = [...state.selectedIds].filter((id) => present.has(id));
  const selection =
    kept.length === state.selectedIds.size
      ? {}
      : { selectedIds: new Set(kept) };
  const activeId =
    state.activeId !== null && !present.has(state.activeId)
      ? { activeId: null }
      : {};
  return { tree, ...historyState(history), ...selection, ...activeId };
}

// An unchanged tree leaves the selection untouched too.
function commitTreeWithSelection(
  state: InternalState,
  tree: readonly BlockNode[],
  selection: Pick<EditorState, "selectedIds" | "activeId">,
): Partial<InternalState> {
  const committed = commitTree(state, tree);
  return "tree" in committed ? { ...committed, ...selection } : committed;
}

/** `blocks` are the specs that decide each node's slots for every tree edit. */
export function createEditorStore(
  blocks: BlockSpecLookup,
  initial?: Partial<
    Pick<EditorState, "tree" | "device" | "breakpoints" | "starterOpen">
  >,
): EditorStoreApi {
  return createStore<InternalStore>((set) => ({
    tree: initial?.tree ?? [],
    selectedIds: new Set<string>(),
    activeId: null,
    hoverId: null,
    device: initial?.device ?? "desktop",
    xray: false,
    breakpoints: initial?.breakpoints ?? DEFAULT_BREAKPOINTS,
    dragSpec: null,
    movingId: null,
    ...historyState(initHistory(initial?.tree ?? [])),
    rightPanel: "block",
    jsonOpen: false,
    starterOpen: initial?.starterOpen ?? false,
    shortcutsOpen: false,
    paletteOpen: false,
    frameRequest: 0,

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
          insertBlockAt(state.tree, node, target, blocks, allowed),
          { selectedIds: new Set([node.id]), activeId: node.id },
        ),
      ),
    moveBlock: (sourceId, target, allowed) =>
      set((state) =>
        commitTree(
          state,
          moveBlockOp(state.tree, sourceId, target, blocks, allowed),
        ),
      ),
    // Keep the table selected (activeId unchanged) so its inspector buttons
    // stay put for repeated clicks, unlike a single-block insert that selects
    // itself.
    addTableColumn: (tableId) =>
      set((state) =>
        commitTree(state, appendTableColumn(state.tree, tableId, blocks)),
      ),
    addTableRow: (tableId) =>
      set((state) =>
        commitTree(state, appendTableRow(state.tree, tableId, blocks)),
      ),
    removeTableColumn: (tableId) =>
      set((state) =>
        commitTree(state, removeTableColumn(state.tree, tableId, blocks)),
      ),
    removeTableRow: (tableId) =>
      set((state) =>
        commitTree(state, removeTableRow(state.tree, tableId, blocks)),
      ),
    updateBlockAttrs: (id, patch) =>
      set((state) =>
        commitTree(
          state,
          mapNodeById(state.tree, id, blocks, (node) =>
            holdsPatch(node, patch)
              ? node
              : { ...node, attrs: { ...node.attrs, ...patch } },
          ),
          // Coalesce a typing burst on one field into a single undo step.
          `attr:${id}:${Object.keys(patch).sort().join(",")}`,
        ),
      ),
    setBlockLabel: (id, rawLabel) =>
      set((state) => {
        const label = rawLabel.trim() || undefined;
        return commitTree(
          state,
          mapNodeById(state.tree, id, blocks, (node) => ({ ...node, label })),
          // Coalesce a rename's keystrokes into one undo step.
          `label:${id}`,
        );
      }),
    updateBlockStyle: (id, bucket, property, value) =>
      set((state) =>
        commitTree(
          state,
          mapNodeById(state.tree, id, blocks, (node) =>
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
          mapNodeById(state.tree, id, blocks, (node) =>
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
          mapNodeById(state.tree, id, blocks, (node) =>
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
          mapNodeById(state.tree, id, blocks, (node) => ({ ...node, tagName })),
        );
      }),
    setBlockClassName: (id, rawClassName) =>
      set((state) => {
        const className = rawClassName.trim() || undefined;
        return commitTree(
          state,
          mapNodeById(state.tree, id, blocks, (node) => ({
            ...node,
            className,
          })),
          // Coalesce a typing burst in the classes field into one undo step.
          `class:${id}`,
        );
      }),
    updateBlockHtmlAttr: (id, key, value) =>
      set((state) =>
        commitTree(
          state,
          mapNodeById(state.tree, id, blocks, (node) =>
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
          mapNodeById(state.tree, id, blocks, (node) =>
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
          removeBlocks(state.tree, state.selectedIds, blocks),
          { selectedIds: new Set(), activeId: null },
        ),
      ),
    duplicateSelected: () =>
      set((state) => {
        let tree = state.tree;
        const newIds: string[] = [];
        // Only clone selection roots; a nested block whose container is also
        // selected is already copied inside that container's clone.
        for (const id of selectionRoots(tree, state.selectedIds, blocks)) {
          const result = duplicateBlock(tree, id, blocks);
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
          const parent = findParentId(state.tree, afterId, blocks);
          if (parent === null) break;
          afterId = parent;
        }
        const { tree, newIds } = pasteBlocksOp(
          state.tree,
          nodes,
          afterId,
          blocks,
        );
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
          blocks,
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
        const result = ungroupBlock(state.tree, state.activeId, blocks);
        if (!result) return {};
        return commitTreeWithSelection(state, result.tree, {
          selectedIds: new Set(result.childIds),
          activeId: result.childIds.at(-1) ?? null,
        });
      }),
    revealBlock: (id) =>
      set((state) => ({
        selectedIds: new Set([id]),
        activeId: id,
        frameRequest: state.frameRequest + 1,
      })),
    selectParent: () =>
      set((state) => {
        if (!state.activeId) return {};
        const parentId = findParentId(state.tree, state.activeId, blocks);
        if (!parentId) return {};
        return { selectedIds: new Set([parentId]), activeId: parentId };
      }),
    moveSelectedBy: (delta) =>
      set((state) => {
        if (!state.activeId) return {};
        return commitTree(
          state,
          moveBlockBy(state.tree, state.activeId, delta, blocks),
        );
      }),
    setHover: (hoverId) => set({ hoverId }),
    setDevice: (device) => set({ device }),
    toggleXray: () => set((s) => ({ xray: !s.xray })),
    setRightPanel: (rightPanel) => set({ rightPanel }),
    setJsonOpen: (jsonOpen) => set({ jsonOpen }),
    setStarterOpen: (starterOpen) => set({ starterOpen }),
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    startBlockDrag: (dragSpec) => set({ dragSpec }),
    endBlockDrag: () => set({ dragSpec: null }),
    startMove: (movingId) => set({ movingId }),
    endMove: () => set({ movingId: null }),
    undo: () => set((state) => restoreTree(state, undo(state.history), blocks)),
    redo: () => set((state) => restoreTree(state, redo(state.history), blocks)),
  }));
}
