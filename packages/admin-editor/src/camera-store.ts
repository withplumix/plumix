import { createStore } from "zustand/vanilla";

import type { View } from "./canvas-view.js";
import { clampZoom, zoomToCursor } from "./canvas-view.js";

// Kept off the document store so pan/zoom causes no re-renders in the tree
// editors.
interface CameraState {
  readonly zoom: number;
  /** Host/container px of the device frame's top-left. */
  readonly panX: number;
  readonly panY: number;
  readonly viewportW: number;
  readonly viewportH: number;
  /** A manual pan/zoom clears it until a device switch or `enableFit`. */
  readonly fit: boolean;
}

interface CameraActions {
  /** Clears fit mode unless `{ fit: true }` (the canvas-driven re-fit). */
  applyView: (view: View, options?: { readonly fit?: boolean }) => void;
  setViewport: (width: number, height: number) => void;
  zoomToCenter: (zoom: number) => void;
  /** The canvas geometry effect then computes the fit view. */
  enableFit: () => void;
}

export type CameraStore = CameraState & CameraActions;

export type CameraStoreApi = ReturnType<typeof createCameraStore>;

export function createCameraStore(
  initial?: Partial<Pick<CameraState, "zoom">>,
) {
  return createStore<CameraStore>((set) => ({
    zoom: initial?.zoom ?? 1,
    panX: 0,
    panY: 0,
    viewportW: 0,
    viewportH: 0,
    fit: true,

    applyView: ({ zoom, panX, panY }, options) =>
      set(
        options?.fit
          ? { zoom: clampZoom(zoom), panX, panY }
          : { zoom: clampZoom(zoom), panX, panY, fit: false },
      ),
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
        if (s.viewportW === 0) return { zoom: next, fit: false };
        // Zoom keeping the viewport center fixed (vs. the wheel's cursor).
        const view = zoomToCursor(
          { zoom: s.zoom, panX: s.panX, panY: s.panY },
          next,
          s.viewportW / 2,
          s.viewportH / 2,
        );
        return { ...view, fit: false };
      }),
    enableFit: () => set({ fit: true }),
  }));
}
