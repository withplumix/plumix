import { describe, expect, test } from "vitest";

import type {
  TelemetrySpan,
  TelemetrySpanLog,
} from "../../context/telemetry.js";
import { buildTimeline } from "./timeline-model.js";

function span(
  name: string,
  startedAt: number,
  durationMs: number,
  children: TelemetrySpan[] = [],
  logs: TelemetrySpanLog[] = [],
): TelemetrySpan {
  return {
    name,
    startedAt,
    durationMs,
    children,
    status: "ok",
    attributes: {},
    logs,
  };
}

describe("buildTimeline", () => {
  test("places a single root span at the window start", () => {
    const timeline = buildTimeline([span("render", 1000, 25)]);

    expect(timeline.totalMs).toBe(25);
    expect(timeline.rows).toEqual([
      { name: "render", depth: 0, offsetMs: 0, durationMs: 25, logs: [] },
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
      { name: "dispatch", depth: 0, offsetMs: 0, durationMs: 100, logs: [] },
      { name: "resolve", depth: 1, offsetMs: 10, durationMs: 30, logs: [] },
      { name: "render", depth: 1, offsetMs: 50, durationMs: 40, logs: [] },
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

  test("puts each span's logs under that span, with their level and offset", () => {
    const log = (
      at: number,
      level: TelemetrySpanLog["level"],
      message: string,
    ): TelemetrySpanLog => ({ at, level, message, attributes: {} });
    const timeline = buildTimeline([
      span(
        "dispatch",
        1000,
        100,
        [span("import feed", 1010, 30, [], [log(1020, "warn", "no slug")])],
        [log(1005, "debug", "routing")],
      ),
    ]);

    expect(timeline.rows).toEqual([
      expect.objectContaining({
        name: "dispatch",
        logs: [{ level: "debug", message: "routing", offsetMs: 5 }],
      }),
      expect.objectContaining({
        name: "import feed",
        logs: [{ level: "warn", message: "no slug", offsetMs: 20 }],
      }),
    ]);
  });
});
