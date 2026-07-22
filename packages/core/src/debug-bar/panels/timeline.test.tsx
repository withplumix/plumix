import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app.js";
import type { TelemetrySpan } from "../../context/telemetry.js";
import { timelinePanel } from "./timeline.js";

function span(
  name: string,
  startedAt: number,
  durationMs: number,
  children: TelemetrySpan[] = [],
): TelemetrySpan {
  return {
    name,
    startedAt,
    durationMs,
    children,
    status: "ok",
    attributes: {},
  };
}

function render(spans: readonly TelemetrySpan[]): string {
  const ctx = { telemetry: { getSpans: () => spans } } as unknown as AppContext;
  return renderToStaticMarkup(<>{timelinePanel.render(ctx)}</>);
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
});
