import { describe, expect, test } from "vitest";

import { metaBoxFieldColSpanClass } from "./meta-box-grid.js";

describe("metaBoxFieldColSpanClass", () => {
  test("omitted span defaults to full width", () => {
    expect(metaBoxFieldColSpanClass(undefined)).toBe("col-span-12");
  });

  test("plain number sets the base span", () => {
    expect(metaBoxFieldColSpanClass(6)).toBe("col-span-6");
  });

  test("responsive object emits mobile-first breakpoints in order", () => {
    expect(metaBoxFieldColSpanClass({ base: 12, sm: 6, md: 4, lg: 3 })).toBe(
      "col-span-12 @sm:col-span-6 @md:col-span-4 @lg:col-span-3",
    );
  });

  test("object without base falls back to full width", () => {
    expect(metaBoxFieldColSpanClass({ md: 6 })).toBe(
      "col-span-12 @md:col-span-6",
    );
  });

  test("only sets classes for breakpoints that were provided", () => {
    expect(metaBoxFieldColSpanClass({ base: 6, lg: 3 })).toBe(
      "col-span-6 @lg:col-span-3",
    );
  });

  test("clamps values outside 1..12", () => {
    expect(metaBoxFieldColSpanClass(0)).toBe("col-span-1");
    expect(metaBoxFieldColSpanClass(99)).toBe("col-span-12");
    expect(metaBoxFieldColSpanClass({ base: -3, md: 200 })).toBe(
      "col-span-1 @md:col-span-12",
    );
  });

  test("rounds fractional spans", () => {
    expect(metaBoxFieldColSpanClass(5.7)).toBe("col-span-6");
  });

  test("non-finite numbers fall back to full width", () => {
    expect(metaBoxFieldColSpanClass(Number.NaN)).toBe("col-span-12");
  });
});
