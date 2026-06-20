import type { BlockRect } from "@plumix/blocks/renderer";

export interface FrameOffset {
  readonly left: number;
  readonly top: number;
}

/**
 * Map a block rect (iframe's unscaled coordinate space) to a screen-space
 * overlay box, accounting for the iframe's on-screen offset and CSS zoom.
 * Computing in the iframe's own space and scaling here is what keeps the
 * overlay aligned at <100% zoom (the Puck overlay bug computed it scaled).
 */
export function overlayBox(
  rect: BlockRect,
  frame: FrameOffset,
  zoom: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: frame.left + rect.x * zoom,
    top: frame.top + rect.y * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  };
}
