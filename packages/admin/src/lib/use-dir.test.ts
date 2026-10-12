import { describe, expect, test } from "vitest";

import { directionOf } from "./use-dir.js";

describe("directionOf", () => {
  test("reads an unset dir as 'ltr'", () => {
    expect(directionOf("")).toBe("ltr");
  });

  test("reads dir='rtl' as 'rtl'", () => {
    expect(directionOf("rtl")).toBe("rtl");
  });

  test("normalizes unknown dir values to 'ltr'", () => {
    // Stale or misconfigured `dir` (e.g. `dir="auto"`) is treated as ltr —
    // the resolved-locale path only ever writes `"ltr"` or `"rtl"`, but
    // the hook stays defensive against direct DOM mutation.
    expect(directionOf("auto")).toBe("ltr");
  });
});
