import { createStore } from "zustand/vanilla";

import type { View } from "./canvas-view.js";
import { clampZoom, zoomToCursor } from "./canvas-view.js";

/**
 * The canvas camera: a Figma-style pannable/zoomable stage floating the device
 * frame. A small, intent-shaped interface over the pure view math in
 * `canvas-view.ts`, kept off the document store so pan/zoom shares no invariants
 * (and no re-renders) with the tree/selection/history editors.
 */
interface CameraState {
  /** Stage scale, clamped to [MIN_ZOOM, MAX_ZOOM]. */
  readonly zoom: number;
  /** Pan offset (px, host/container space) of the device frame's top-left. */
  readonly panX: number;
  readonly panY: number;
  /** The canvas viewport size, mirrored from the host so view actions
   *  (zoom-to-center) can do their math without the DOM. */
  readonly viewportW: number;
  readonly viewportH: number;
  /** When true, the camera auto-fits the frame to the viewport width; a manual
   *  pan/zoom clears it until a device switch or `enableFit` restores it. */
  readonly fit: boolean;
}

interface CameraActions {
  /** Apply a full view (zoom clamped + pan). A manual gesture by default,
   *  which clears fit mode; pass `{ fit: true }` for the canvas-driven re-fit,
   *  which leaves the fit flag untouched (that geometry is only computed while
   *  already in fit mode). Subsumes the former setView / setPan / applyFitView. */
  applyView: (view: View, options?: { readonly fit?: boolean }) => void;
  /** Mirror the host canvas viewport size so view actions can do their math. */
  setViewport: (width: number, height: number) => void;
  /** Zoom keeping the viewport center's point fixed (the toolbar +/- buttons,
   *  vs. the wheel's zoom-to-cursor). Leaves fit mode. */
  zoomToCenter: (zoom: number) => void;
  /** Re-enter fit-to-width (the toolbar's "Fit" action + a device switch). The
   *  canvas geometry effect then computes and applies the centered fit view. */
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
