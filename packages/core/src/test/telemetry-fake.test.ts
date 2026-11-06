import { describe, expect, test } from "vitest";

import type { TelemetrySnapshot, TelemetrySpan } from "../context/telemetry.js";
import { fakeTelemetry } from "./telemetry-fake.js";

function span(
  name: string,
  attributes: TelemetrySpan["attributes"] = {},
  children: TelemetrySpan[] = [],
): TelemetrySpan {
  return {
    name,
    startedAt: 0,
    durationMs: 1,
    status: "ok",
    attributes,
    logs: [],
    children,
  };
}

function snapshotOf(...spans: TelemetrySpan[]): TelemetrySnapshot {
  return {
    request: {
      requestId: "r1",
      method: "GET",
      url: "https://cms.example/",
      status: 200,
      startedAt: 0,
      durationMs: 1,
    },
    spans,
    records: {},
    dropped: { spans: 0, records: {}, logs: 0 },
  };
}

describe("a snapshot the site delivered", () => {
  test("is kept in delivery order", () => {
    const telemetry = fakeTelemetry();
    const first = snapshotOf(span("dispatch"));
    const second = snapshotOf(span("scheduled"));

    telemetry.record(first);
    telemetry.record(second);

    expect(telemetry.snapshots).toEqual([first, second]);
  });
});

describe("finding a span", () => {
  test("returns a span nested under another", () => {
    const telemetry = fakeTelemetry();
    telemetry.record(
      snapshotOf(span("dispatch", {}, [span("render", { "page.id": 7 })])),
    );

    expect(telemetry.span("render").attributes).toEqual({ "page.id": 7 });
  });

  test("returns the first of two spans with one name, in delivery order", () => {
    const telemetry = fakeTelemetry();
    telemetry.record(snapshotOf(span("dispatch", { n: 1 })));
    telemetry.record(snapshotOf(span("dispatch", { n: 2 })));

    expect(telemetry.span("dispatch").attributes).toEqual({ n: 1 });
  });

  test("fails naming every span recorded, nested ones included", () => {
    const telemetry = fakeTelemetry();
    telemetry.record(snapshotOf(span("dispatch", {}, [span("render")])));

    expect(() => telemetry.span("query")).toThrow(
      'Expected a span named "query", but none was recorded.\nRecorded:\n  dispatch\n  render',
    );
  });

  test("fails saying no spans were recorded when nothing was delivered", () => {
    const telemetry = fakeTelemetry();

    expect(() => telemetry.span("dispatch")).toThrow(
      'Expected a span named "dispatch", but none was recorded.\nRecorded: no spans.',
    );
  });
});
