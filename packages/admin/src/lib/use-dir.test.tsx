import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { useDir } from "./use-dir.js";

afterEach(() => {
  document.documentElement.removeAttribute("dir");
});

describe("useDir", () => {
  test("returns 'ltr' when <html dir> is unset", () => {
    const { result } = renderHook(() => useDir());
    expect(result.current).toBe("ltr");
  });

  test("returns 'rtl' when <html dir='rtl'>", () => {
    document.documentElement.dir = "rtl";
    const { result } = renderHook(() => useDir());
    expect(result.current).toBe("rtl");
  });

  test("normalizes unknown dir values to 'ltr'", () => {
    // Stale or misconfigured `dir` (e.g. `dir="auto"`) is treated as ltr —
    // the resolved-locale path only ever writes `"ltr"` or `"rtl"`, but
    // the hook stays defensive against direct DOM mutation.
    document.documentElement.dir = "auto";
    const { result } = renderHook(() => useDir());
    expect(result.current).toBe("ltr");
  });
});
