import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { TelemetrySpan } from "../../../context/telemetry.js";
import { makeSnapshot } from "../../request-history/snapshot-fixture.js";
import { timelinePanel } from "./timeline.js";

function span(
  name: string,
  startedAt: number,
  durationMs: number,
  children: TelemetrySpan[] = [],
  logs: TelemetrySpan["logs"] = [],
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

function render(spans: readonly TelemetrySpan[]): string {
  return renderToStaticMarkup(
    <>{timelinePanel.render(makeSnapshot({ spans }))}</>,
  );
}

describe("timelinePanel", () => {
  test("draws an SVG waterfall with span names and the total time", () => {
    const html = render([
      span("dispatch", 1000, 40, [span("db: select", 1010, 15)]),
    ]);

    expect(html).toContain("<svg");
    expect(html).toContain("dispatch");
    expect(html).toContain("db: select");
    expect(html).toContain("40"); // total window ms
  });

  test("shows an empty state when nothing was timed", () => {
    const html = render([]);

    expect(html).not.toContain("<svg");
    expect(html).toContain("No spans");
  });

  test("lists each span's logs under that span, marked with their level", () => {
    const html = render([
      span(
        "import feed",
        1000,
        40,
        [],
        [{ at: 1012, level: "warn", message: "no slug", attributes: {} }],
      ),
    ]);

    expect(html).toContain("plumix-debug-bar__span-log--warn");
    expect(html).toMatch(/import feed[\s\S]*\+12ms[\s\S]*warn[\s\S]*no slug/);
  });
});
