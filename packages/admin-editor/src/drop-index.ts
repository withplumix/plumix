interface VerticalSpan {
  readonly y: number;
  readonly height: number;
}

/**
 * `spans` must be in tree order and in the same coordinate space as `pointerY`.
 */
export function dropIndexFromPointer(
  spans: readonly VerticalSpan[],
  pointerY: number,
): number {
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span && pointerY < span.y + span.height / 2) return i;
  }
  return spans.length;
}

interface DropPlacement {
  readonly index: number;
  // Null when the canvas has no blocks.
  readonly indicatorY: number | null;
}

/** Insertion index plus where to draw the drop indicator: at the top edge of
 *  the block we'd insert before, or the bottom edge of the last block. */
export function dropPlacement(
  spans: readonly VerticalSpan[],
  pointerY: number,
): DropPlacement {
  const index = dropIndexFromPointer(spans, pointerY);
  const last = spans[spans.length - 1];
  if (!last) return { index: 0, indicatorY: null };
  const target = spans[index];
  return { index, indicatorY: target ? target.y : last.y + last.height };
}
