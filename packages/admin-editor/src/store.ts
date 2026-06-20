import { createStore } from "zustand/vanilla";

import type { BlockNode } from "@plumix/blocks";

export type EditorDevice = "desktop" | "tablet" | "mobile";

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
  select: (id: string, options?: { readonly additive?: boolean }) => void;
  clearSelection: () => void;
  setHover: (id: string | null) => void;
  setDevice: (device: EditorDevice) => void;
  setZoom: (zoom: number) => void;
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
