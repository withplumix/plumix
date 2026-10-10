export interface FrameOffset {
  readonly left: number;
  readonly top: number;
}

/** A positioned box (overlay outline, toolbar anchor, clip region). */
export interface OverlayBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface PositionedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Takes the unscaled iframe-space rect; scaling here keeps the overlay aligned
 * below 100% zoom.
 */
export function overlayBox(
  rect: PositionedRect,
  frame: FrameOffset,
  zoom: number,
): OverlayBox {
  return {
    left: frame.left + rect.x * zoom,
    top: frame.top + rect.y * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  };
}

/** A number as a CSS pixel length. React appends no unit to a custom
 *  property, and `.plumix-canvas-overlay` reads its `--box-*` as lengths. */
export const px = (n: number): string => `${String(n)}px`;
