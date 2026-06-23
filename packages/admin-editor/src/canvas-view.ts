// Pure view math for the free canvas (no React, no store) — the device frame
// floats in a Figma-style pannable/zoomable stage. Kept here so both the store
// (toolbar zoom-to-center) and the canvas component (wheel, fit, zoom-to-
// selection) share one tested implementation, and so the geometry is unit-
// testable without a layout engine.

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
// Keep at least this much of the frame inside the viewport so it can't be
// panned into the void, and fit with this much top breathing room.
const MIN_VISIBLE = 64;
const FIT_MARGIN_Y = 32;
// Zoom-to-selection leaves this fraction of the viewport as padding around the
// framed block.
const SELECTION_FIT = 0.85;

/** The canvas viewport transform: the frame's top-left offset + scale. */
export interface View {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export const clampZoom = (z: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Clamp a pan offset so `MIN_VISIBLE` px of the (scaled) frame stay inside the
 *  viewport — the frame can always be grabbed back. */
export function clampPan(
  pan: number,
  scaled: number,
  viewport: number,
): number {
  return Math.min(viewport - MIN_VISIBLE, Math.max(MIN_VISIBLE - scaled, pan));
}

/** Clamp a candidate pan on both axes against the scaled frame size and the
 *  viewport box — every pan/zoom gesture lands here so the frame stays
 *  grabbable. */
export function clampPanToFrame(
  panX: number,
  panY: number,
  scaledW: number,
  scaledH: number,
  vw: number,
  vh: number,
): { readonly panX: number; readonly panY: number } {
  return {
    panX: clampPan(panX, scaledW, vw),
    panY: clampPan(panY, scaledH, vh),
  };
}

/** Center the frame in the viewport at a never-upscaled fit-to-width zoom (top
 *  margin when it's taller than the viewport). What a device switch and "fit"
 *  both land on, so the frame is always on-screen, never pinned top-left. */
export function fitView(
  frameWidth: number,
  contentHeight: number,
  vw: number,
  vh: number,
): View {
  const zoom = clampZoom(Math.min(1, vw / frameWidth));
  const scaledH = contentHeight * zoom;
  return {
    zoom,
    panX: Math.round((vw - frameWidth * zoom) / 2),
    panY: Math.round(scaledH < vh ? (vh - scaledH) / 2 : FIT_MARGIN_Y),
  };
}

/** Zoom to `nextZoom` keeping the world point under `(cx, cy)` (viewport space)
 *  fixed — used for both wheel zoom-to-cursor and toolbar zoom-to-center. */
export function zoomToCursor(
  view: View,
  nextZoom: number,
  cx: number,
  cy: number,
): View {
  const zoom = clampZoom(nextZoom);
  const wx = (cx - view.panX) / view.zoom;
  const wy = (cy - view.panY) / view.zoom;
  return { zoom, panX: cx - wx * zoom, panY: cy - wy * zoom };
}

/** Frame a block: the largest zoom that fits its rect (with padding) inside the
 *  viewport, panned so the block is centered. `rect` is in the frame's unscaled
 *  coordinate space. */
export function frameSelection(
  rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  vw: number,
  vh: number,
): View {
  const zoom = clampZoom(
    Math.min(
      (vw * SELECTION_FIT) / rect.width,
      (vh * SELECTION_FIT) / rect.height,
    ),
  );
  return {
    zoom,
    panX: vw / 2 - (rect.x + rect.width / 2) * zoom,
    panY: vh / 2 - (rect.y + rect.height / 2) * zoom,
  };
}
