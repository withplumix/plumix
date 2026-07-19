import { describe, expect, test } from "vitest";

import { NOOP_DEBUG } from "./debug.js";

describe("NOOP_DEBUG", () => {
  test("records nothing, reads empty, and passes span through", () => {
    NOOP_DEBUG.record("anything", { label: "x" });

    expect(NOOP_DEBUG.get("anything")).toEqual([]);
    expect(NOOP_DEBUG.getSpans()).toEqual([]);
    expect(NOOP_DEBUG.span("work", () => 7)).toBe(7);
  });
});
