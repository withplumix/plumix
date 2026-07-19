import type { ReactNode } from "react";

import type { AppContext } from "../../context/app.js";
import type { Timeline } from "../timeline-model.js";
import type { DebugPanel } from "../types.js";
import { DebugSection } from "../primitives.js";
import { timelineGeometry } from "../timeline-geometry.js";
import { buildTimeline } from "../timeline-model.js";

/** Panel id, also the disable-denylist key and tab testid suffix. */
export const TIMELINE_PANEL_ID = "timeline";

// SVG is drawn in a nominal coordinate space and scaled to 100% width by the
// viewBox. A fixed left gutter holds the (depth-indented) span names, a fixed
// right column holds right-aligned durations, and bars scale into the middle.
const VIEW_WIDTH = 400;
const GUTTER = 132;
const MS_COL = 34;
const ROW_HEIGHT = 13;
const ROW_GAP = 4;

function TimelineChart({
  timeline,
}: {
  readonly timeline: Timeline;
}): ReactNode {
  const geometry = timelineGeometry(timeline, {
    width: VIEW_WIDTH - GUTTER - MS_COL,
    rowHeight: ROW_HEIGHT,
    rowGap: ROW_GAP,
    minBarWidth: 2,
  });

  return (
    <svg
      className="plumix-debug-bar__timeline"
      viewBox={`0 0 ${VIEW_WIDTH} ${geometry.height}`}
      width="100%"
      height={geometry.height}
      role="img"
    >
      {geometry.rects.map((rect, i) => {
        const depth = timeline.rows[i]?.depth ?? 0;
        const textY = rect.y + ROW_HEIGHT - 3;
        return (
          <g key={i}>
            <text
              className="plumix-debug-bar__timeline-name"
              x={4 + depth * 8}
              y={textY}
            >
              {rect.name}
            </text>
            <rect
              className="plumix-debug-bar__timeline-bar"
              x={GUTTER + rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              rx={2}
            />
            <text
              className="plumix-debug-bar__timeline-ms"
              x={VIEW_WIDTH}
              y={textY}
              textAnchor="end"
            >
              {timeline.rows[i]?.durationMs ?? 0}ms
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The Timeline panel: a zero-JS SVG waterfall of the request's spans (dispatch,
 * resolve, render, and each database query), read from the collector's span
 * tree. Empty when nothing was timed — e.g. a route that touches no database
 * and isn't instrumented, or the panel's own collection disabled.
 */
export const timelinePanel: DebugPanel = {
  id: TIMELINE_PANEL_ID,
  title: "Timeline",
  order: 50,
  render: (ctx: AppContext) => {
    const timeline = buildTimeline(ctx.debug.getSpans());
    if (timeline.rows.length === 0) {
      return <p className="plumix-debug-bar__empty">No spans recorded.</p>;
    }
    return (
      <DebugSection title={`Total ${timeline.totalMs}ms`}>
        <TimelineChart timeline={timeline} />
      </DebugSection>
    );
  },
};
