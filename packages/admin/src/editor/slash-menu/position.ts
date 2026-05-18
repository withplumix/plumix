const GAP = 4;

interface CaretRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
}

interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly scrollX: number;
  readonly scrollY: number;
}

interface MenuSize {
  readonly width: number;
  readonly height: number;
}

interface MenuPosition {
  readonly top: number;
  readonly left: number;
}

export function clampMenuPosition(input: {
  readonly caret: CaretRect;
  readonly viewport: Viewport;
  readonly menu: MenuSize;
}): MenuPosition {
  const { caret, viewport, menu } = input;
  const fitsBelow = caret.bottom + GAP + menu.height <= viewport.height;
  const topViewport = fitsBelow
    ? caret.bottom + GAP
    : Math.max(caret.top - GAP - menu.height, 0);
  const maxLeft = Math.max(viewport.width - menu.width, 0);
  const clampedLeft = Math.min(Math.max(caret.left, 0), maxLeft);
  return {
    top: topViewport + viewport.scrollY,
    left: clampedLeft + viewport.scrollX,
  };
}
