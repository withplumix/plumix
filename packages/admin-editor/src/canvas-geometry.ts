import type { BlockRect, SlotRect } from "@plumix/blocks/renderer";

import type { FrameOffset, OverlayBox } from "./overlay.js";

/** Fallback stage height before the iframe reports its content height. */
export const CANVAS_HEIGHT = 800;

/** Live geometry of the canvas iframe, reported by the bridge and re-measured
 *  on scroll/resize/pan — shared by the overlays, pan/zoom, and drag hit-tests. */
export interface Geometry {
  readonly rects: ReadonlyMap<string, BlockRect>;
  /** Container slot regions (iframe coords), for resolving nested drops. */
  readonly slots: readonly SlotRect[];
  /** The iframe's on-screen offset, for mapping block rects to overlay boxes. */
  readonly frame: FrameOffset | null;
  /** The canvas viewport's on-screen box — overlays clip to this so they never
   *  spill over the side rails (the iframe renders wider than the column). */
  readonly container: OverlayBox | null;
}

/** A resolved nested-drop target: which slot, and its on-screen box. */
export interface SlotDrop {
  readonly parentId: string;
  readonly slotKey: string;
  readonly box: OverlayBox;
}
