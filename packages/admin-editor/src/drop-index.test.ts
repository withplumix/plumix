import { describe, expect, test } from "vitest";

import { dropIndexFromPointer, dropPlacement } from "./drop-index.js";

// Three stacked blocks, 100px tall each: midpoints at 50, 150, 250.
const SPANS = [
  { y: 0, height: 100 },
  { y: 100, height: 100 },
  { y: 200, height: 100 },
];

describe("dropIndexFromPointer", () => {
  test("returns 0 above the first block's midpoint", () => {
    expect(dropIndexFromPointer(SPANS, 10)).toBe(0);
    expect(dropIndexFromPointer(SPANS, 49)).toBe(0);
  });

  test("returns the index of the block whose midpoint the pointer passed", () => {
    expect(dropIndexFromPointer(SPANS, 51)).toBe(1);
    expect(dropIndexFromPointer(SPANS, 149)).toBe(1);
    expect(dropIndexFromPointer(SPANS, 151)).toBe(2);
  });

  test("returns the end index below the last midpoint", () => {
    expect(dropIndexFromPointer(SPANS, 260)).toBe(3);
  });

  test("returns 0 for an empty canvas", () => {
    expect(dropIndexFromPointer([], 42)).toBe(0);
  });
});

describe("dropPlacement", () => {
  test("indicator sits at the top edge of the block dropped before", () => {
    expect(dropPlacement(SPANS, 51)).toEqual({ index: 1, indicatorY: 100 });
  });

  test("indicator sits at the bottom edge when dropping at the end", () => {
    expect(dropPlacement(SPANS, 999)).toEqual({ index: 3, indicatorY: 300 });
  });

  test("no indicator for an empty canvas", () => {
    expect(dropPlacement([], 10)).toEqual({ index: 0, indicatorY: null });
  });
});
