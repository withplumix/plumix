import { describe, expect, test } from "vitest";

import { untitledLabel } from "./use-untitled-label.js";

const UNTITLED = { id: "type.generic.untitledItem", message: "Untitled" };

describe("untitledLabel", () => {
  test("passes through a non-null label unchanged", () => {
    expect(untitledLabel("My post", "post", {})).toBe("My post");
  });

  test("gives the generic untitled label when the label is null and no type is named", () => {
    expect(untitledLabel(null, undefined, {})).toEqual(UNTITLED);
  });

  test("gives the generic untitled label when the label is null and the type is unknown", () => {
    expect(untitledLabel(null, "nonexistent-type", {})).toEqual(UNTITLED);
  });
});
