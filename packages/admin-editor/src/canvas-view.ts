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

/** Fold a free-canvas wheel event into the next view: zoom-to-cursor (Ctrl/Cmd
 *  intent) or pan, re-clamped so the frame stays reachable either way.
 *  `scaledFrame` is the iframe's live on-screen size (scaled at the current
 *  zoom); `cursor` is in viewport space. A zoom already at a limit returns the
 *  same `view` object so the caller can skip a redundant gesture write. */
export function wheelToView(
  view: View,
  wheel: {
    readonly deltaX: number;
    readonly deltaY: number;
    readonly zoomIntent: boolean;
  },
  cursor: { readonly cx: number; readonly cy: number },
  scaledFrame: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
): View {
  if (wheel.zoomIntent) {
    const nextZoom = clampZoom(view.zoom * Math.exp(-wheel.deltaY * 0.0015));
    if (nextZoom === view.zoom) return view; // already at a zoom limit
    // Zoom toward the cursor, then clamp so the frame stays reachable. The
    // unscaled frame is the live rect divided back out by the current zoom.
    const zoomed = zoomToCursor(view, nextZoom, cursor.cx, cursor.cy);
    const baseW = scaledFrame.width / view.zoom;
    const baseH = scaledFrame.height / view.zoom;
    return {
      zoom: zoomed.zoom,
      ...clampPanToFrame(
        zoomed.panX,
        zoomed.panY,
        baseW * zoomed.zoom,
        baseH * zoomed.zoom,
        viewport.width,
        viewport.height,
      ),
    };
  }
  return {
    zoom: view.zoom,
    ...clampPanToFrame(
      view.panX - wheel.deltaX,
      view.panY - wheel.deltaY,
      scaledFrame.width,
      scaledFrame.height,
      viewport.width,
      viewport.height,
    ),
  };
}

/** The view the canvas should settle to after a geometry/camera change: re-fit
 *  and center while in fit mode, otherwise re-clamp the current pan so the frame
 *  stays reachable. Returns `null` when the current view already satisfies the
 *  constraint, so the caller skips a redundant store write. */
export function reconcileView(
  input:
    | {
        readonly fit: true;
        readonly view: View;
        readonly frameWidth: number;
        readonly contentHeight: number;
        readonly viewport: { readonly width: number; readonly height: number };
      }
    | {
        readonly fit: false;
        readonly view: View;
        readonly scaledFrame: {
          readonly width: number;
          readonly height: number;
        };
        readonly viewport: { readonly width: number; readonly height: number };
      },
): View | null {
  if (input.fit) {
    const { view, viewport } = input;
    const next = fitView(
      input.frameWidth,
      input.contentHeight,
      viewport.width,
      viewport.height,
    );
    return next.zoom !== view.zoom ||
      next.panX !== view.panX ||
      next.panY !== view.panY
      ? next
      : null;
  }
  const { view, scaledFrame, viewport } = input;
  const { panX, panY } = clampPanToFrame(
    view.panX,
    view.panY,
    scaledFrame.width,
    scaledFrame.height,
    viewport.width,
    viewport.height,
  );
  return panX !== view.panX || panY !== view.panY
    ? { zoom: view.zoom, panX, panY }
    : null;
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
