import { describe, expect, test } from "vitest";

import { isTypingTarget } from "./shortcuts.js";

describe("isTypingTarget", () => {
  test("form fields and editable content are typing targets", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(isTypingTarget(document.createElement(tag))).toBe(true);
    }
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    expect(isTypingTarget(editable)).toBe(true);
  });

  test("anything else is not", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
