import { createStore } from "zustand/vanilla";

import type { BlockNode } from "@plumix/blocks";
import { isBlockNodeArray } from "@plumix/blocks";

export type EditorDevice = "desktop" | "tablet" | "mobile";

// Default canvas widths per device. The theme can override these via the
// manifest (theme-defined breakpoints); these are the fallbacks.
export const DEVICE_WIDTH: Record<EditorDevice, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 375,
};

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

export interface EditorState {
  /** Canonical block tree — the single source of truth pushed to the canvas. */
  readonly tree: readonly BlockNode[];
  readonly selectedIds: ReadonlySet<string>;
  /** Last-clicked block; the inspector edits this one when several are selected. */
  readonly activeId: string | null;
  readonly hoverId: string | null;
  readonly device: EditorDevice;
  readonly zoom: number;
}

export interface EditorActions {
  setTree: (tree: readonly BlockNode[]) => void;
  /** Merge a partial attrs patch into one block, anywhere in the tree. */
  updateBlockAttrs: (
    id: string,
    patch: Readonly<Record<string, unknown>>,
  ) => void;
  select: (id: string, options?: { readonly additive?: boolean }) => void;
  clearSelection: () => void;
  setHover: (id: string | null) => void;
  setDevice: (device: EditorDevice) => void;
  setZoom: (zoom: number) => void;
}

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
  initial?: Partial<Pick<EditorState, "tree" | "device" | "zoom">>,
) {
  return createStore<EditorStore>((set) => ({
    tree: initial?.tree ?? [],
    selectedIds: new Set<string>(),
    activeId: null,
    hoverId: null,
    device: initial?.device ?? "desktop",
    zoom: initial?.zoom ?? 1,

    setTree: (tree) => set({ tree }),
    updateBlockAttrs: (id, patch) =>
      set((state) => ({ tree: patchAttrs(state.tree, id, patch) })),
    select: (id, options) =>
      set((state) => ({
        selectedIds: options?.additive
          ? new Set(state.selectedIds).add(id)
          : new Set([id]),
        activeId: id,
      })),
    clearSelection: () => set({ selectedIds: new Set(), activeId: null }),
    setHover: (hoverId) => set({ hoverId }),
    setDevice: (device) => set({ device }),
    setZoom: (zoom) =>
      set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  }));
}
