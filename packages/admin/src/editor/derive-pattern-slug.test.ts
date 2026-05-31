import { describe, expect, test } from "vitest";

import { derivePatternSlug } from "./derive-pattern-slug.js";

describe("derivePatternSlug", () => {
  test("kebabs a plain title under the starter namespace", () => {
    expect(derivePatternSlug("Hero Section")).toBe("starter/hero-section");
  });

  test("collapses non-alphanumeric runs to single hyphens and lowercases", () => {
    expect(derivePatternSlug("My Awesome 2026 Hero!")).toBe(
      "starter/my-awesome-2026-hero",
    );
  });

  test("falls back to starter/untitled when the title strips to nothing", () => {
    expect(derivePatternSlug("")).toBe("starter/untitled");
    expect(derivePatternSlug("!!! ??? ---")).toBe("starter/untitled");
  });

  test("trims leading and trailing hyphens off the derived suffix", () => {
    expect(derivePatternSlug("  Hello  ")).toBe("starter/hello");
    expect(derivePatternSlug("-foo-")).toBe("starter/foo");
  });
});
