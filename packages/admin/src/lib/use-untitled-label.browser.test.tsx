import { describe, expect, test } from "vitest";

import { renderHookWithI18n } from "../../test/render-with-i18n.js";
import { useUntitledLabel } from "./use-untitled-label.js";

describe("useUntitledLabel", () => {
  test("passes through a non-null label unchanged", () => {
    const { result } = renderHookWithI18n(() => useUntitledLabel());
    expect(result.current("My post", "post")).toBe("My post");
    expect(result.current("Category A", "category")).toBe("Category A");
  });

  test("resolves to a localized 'Untitled' string when label is null and targetType unknown", () => {
    const { result } = renderHookWithI18n(() => useUntitledLabel());
    expect(result.current(null)).toMatch(/untitled/i);
    expect(result.current(null, "nonexistent-type")).toMatch(/untitled/i);
  });

  test("resolves deterministically for the same inputs across renders", () => {
    // The contract is "same inputs, same string", not closure identity.
    const { result, rerender } = renderHookWithI18n(() => useUntitledLabel());
    const firstUntitled = result.current(null);
    const firstTitled = result.current("Hello", "post");
    rerender();
    expect(result.current(null)).toBe(firstUntitled);
    expect(result.current("Hello", "post")).toBe(firstTitled);
  });
});
