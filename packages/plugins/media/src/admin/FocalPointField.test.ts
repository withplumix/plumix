import { describe, expect, test } from "vitest";

import { focalFromPointer } from "./FocalPointField.js";

const rect = { left: 100, top: 50, width: 200, height: 100 };

describe("focalFromPointer", () => {
  test("center of the frame is { 0.5, 0.5 }", () => {
    expect(focalFromPointer(rect, 200, 100)).toEqual({ x: 0.5, y: 0.5 });
  });

  test("top-left corner is { 0, 0 }", () => {
    expect(focalFromPointer(rect, 100, 50)).toEqual({ x: 0, y: 0 });
  });

  test("bottom-right corner is { 1, 1 }", () => {
    expect(focalFromPointer(rect, 300, 150)).toEqual({ x: 1, y: 1 });
  });

  test("clamps a pointer outside the frame to [0, 1]", () => {
    expect(focalFromPointer(rect, 20, 400)).toEqual({ x: 0, y: 1 });
  });

  test("a zero-size frame (unmeasured) yields the center, not NaN", () => {
    expect(
      focalFromPointer({ left: 0, top: 0, width: 0, height: 0 }, 10, 10),
    ).toEqual({ x: 0.5, y: 0.5 });
  });
});
