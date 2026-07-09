import { describe, expect, test } from "vitest";

import { isViewShortcut } from "./use-canvas-keys.js";

describe("isViewShortcut", () => {
  test("Space is a shortcut regardless of shift", () => {
    expect(isViewShortcut("Space", false)).toBe(true);
    expect(isViewShortcut("Space", true)).toBe(true);
  });

  test("Shift+0/1/2/X are shortcuts", () => {
    for (const code of ["Digit0", "Digit1", "Digit2", "KeyX"]) {
      expect(isViewShortcut(code, true)).toBe(true);
    }
  });

  test("the same digits/keys without shift are not shortcuts", () => {
    for (const code of ["Digit0", "Digit1", "Digit2", "KeyX"]) {
      expect(isViewShortcut(code, false)).toBe(false);
    }
  });

  test("unrelated keys are never shortcuts", () => {
    expect(isViewShortcut("KeyA", true)).toBe(false);
    expect(isViewShortcut("Digit3", true)).toBe(false);
    expect(isViewShortcut("Enter", false)).toBe(false);
  });
});
