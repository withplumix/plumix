import type { Timeline } from "./timeline-model.js";

export interface TimelineRectOptions {
  /** Total SVG width the waterfall is scaled into. */
  readonly width: number;
  readonly rowHeight: number;
  /** Vertical gap between rows. */
  readonly rowGap: number;
  /** Floor width so zero- and sub-pixel-duration bars stay visible. */
  readonly minBarWidth: number;
}

interface TimelineRect {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TimelineGeometry {
  readonly width: number;
  readonly height: number;
  readonly rects: readonly TimelineRect[];
}

/**
 * Maps a {@link Timeline} to SVG rectangle coordinates for the waterfall. Pure
 * and dimensionless of any DOM — one row per span, stacked top to bottom, each
 * bar positioned and scaled against the window. The panel renders the rects.
 */
export function timelineGeometry(
  timeline: Timeline,
  options: TimelineRectOptions,
): TimelineGeometry {
  const { width, rowHeight, rowGap, minBarWidth } = options;
  const { rows, totalMs } = timeline;
  const scale = totalMs > 0 ? width / totalMs : 0;

  const rects = rows.map((row, i) => {
    const barWidth = Math.max(row.durationMs * scale, minBarWidth);
    return {
      name: row.name,
      // Clamp so a bar at (or near) the window end doesn't spill past the edge.
      x: Math.min(row.offsetMs * scale, width - barWidth),
      y: i * (rowHeight + rowGap),
      width: barWidth,
      height: rowHeight,
    };
  });

  const height =
    rows.length === 0
      ? 0
      : rows.length * rowHeight + (rows.length - 1) * rowGap;

  return { width, height, rects };
}
