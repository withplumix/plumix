import { describe, expect, test } from "vitest";

import { NOOP_TELEMETRY } from "./telemetry.js";

describe("NOOP_TELEMETRY", () => {
  test("records nothing, reads empty, and passes span through", () => {
    NOOP_TELEMETRY.record("anything", { label: "x" });

    expect(NOOP_TELEMETRY.get("anything")).toEqual([]);
    expect(NOOP_TELEMETRY.getSpans()).toEqual([]);
    expect(NOOP_TELEMETRY.span("work", () => 7)).toBe(7);
  });

  test("record never evaluates a thunk entry", () => {
    let calls = 0;

    NOOP_TELEMETRY.record("anything", () => {
      calls += 1;
      return { label: "never" };
    });

    expect(calls).toBe(0);
  });

  test("span handle accepts attributes without evaluating lazy values", () => {
    let calls = 0;

    const result = NOOP_TELEMETRY.span("work", (s) => {
      s.set("cheap", "x");
      s.set("expensive", () => {
        calls += 1;
        return "never";
      });
      return 7;
    });

    expect(result).toBe(7);
    expect(calls).toBe(0);
  });
});
