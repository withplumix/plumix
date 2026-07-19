import { describe, expect, test } from "vitest";

import type { TraceSpan } from "../context/stores.js";
import { buildTimeline } from "./timeline-model.js";

function span(
  name: string,
  startedAt: number,
  durationMs: number,
  children: TraceSpan[] = [],
): TraceSpan {
  return { name, startedAt, durationMs, children, annotations: {} };
}

describe("buildTimeline", () => {
  test("places a single root span at the window start", () => {
    const timeline = buildTimeline([span("render", 1000, 25)]);

    expect(timeline.totalMs).toBe(25);
    expect(timeline.rows).toEqual([
      { name: "render", depth: 0, offsetMs: 0, durationMs: 25 },
    ]);
  });

  test("flattens nested and sibling spans depth-first with offsets and depth", () => {
    const timeline = buildTimeline([
      span("dispatch", 1000, 100, [
        span("resolve", 1010, 30),
        span("render", 1050, 40),
      ]),
    ]);

    expect(timeline.totalMs).toBe(100);
    expect(timeline.rows).toEqual([
      { name: "dispatch", depth: 0, offsetMs: 0, durationMs: 100 },
      { name: "resolve", depth: 1, offsetMs: 10, durationMs: 30 },
      { name: "render", depth: 1, offsetMs: 50, durationMs: 40 },
    ]);
  });

  test("returns an empty timeline when there are no spans", () => {
    expect(buildTimeline([])).toEqual({ rows: [], totalMs: 0 });
  });

  test("window end tracks a child that outlasts its parent", () => {
    // A deferred write can finish after the parent span is stamped; the window
    // must still cover it so nothing renders past the right edge.
    const timeline = buildTimeline([
      span("render", 1000, 20, [span("db: select", 1015, 30)]),
    ]);

    expect(timeline.totalMs).toBe(45); // 1045 - 1000, not the parent's 20
  });
});
