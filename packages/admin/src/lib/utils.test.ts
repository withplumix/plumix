import { describe, expect, test } from "vitest";

import { cn } from "./utils.js";

describe("cn", () => {
  test("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  test("resolves conflicting Tailwind utilities in favor of the last", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  test("skips null and undefined inputs", () => {
    expect(cn("base", null, undefined, "on")).toBe("base on");
  });
});
