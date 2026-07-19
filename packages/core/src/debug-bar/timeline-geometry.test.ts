import { describe, expect, test } from "vitest";

import type { Timeline } from "./timeline-model.js";
import { timelineGeometry } from "./timeline-geometry.js";

const OPTS = { width: 200, rowHeight: 14, rowGap: 2, minBarWidth: 2 };

describe("timelineGeometry", () => {
  test("maps a full-window span to a full-width bar on the first row", () => {
    const timeline: Timeline = {
      rows: [{ name: "render", depth: 0, offsetMs: 0, durationMs: 100 }],
      totalMs: 100,
    };

    const geometry = timelineGeometry(timeline, OPTS);

    expect(geometry.width).toBe(200);
    expect(geometry.height).toBe(14);
    expect(geometry.rects).toEqual([
      { name: "render", x: 0, y: 0, width: 200, height: 14 },
    ]);
  });

  test("stacks rows with the gap and floors a zero-duration bar to min width", () => {
    const timeline: Timeline = {
      rows: [
        { name: "render", depth: 0, offsetMs: 0, durationMs: 100 },
        { name: "db: select", depth: 1, offsetMs: 50, durationMs: 0 },
      ],
      totalMs: 100,
    };

    const geometry = timelineGeometry(timeline, OPTS);

    expect(geometry.height).toBe(30); // 2*14 + 1*2
    expect(geometry.rects).toEqual([
      { name: "render", x: 0, y: 0, width: 200, height: 14 },
      { name: "db: select", x: 100, y: 16, width: 2, height: 14 },
    ]);
  });

  test("keeps a bar at the window's end inside the width", () => {
    const timeline: Timeline = {
      rows: [{ name: "flush", depth: 0, offsetMs: 100, durationMs: 0 }],
      totalMs: 100,
    };

    const geometry = timelineGeometry(timeline, OPTS);

    // Naive x would be 200; the min-width bar must not spill past the edge.
    expect(geometry.rects[0]).toEqual({
      name: "flush",
      x: 198,
      y: 0,
      width: 2,
      height: 14,
    });
  });
});
