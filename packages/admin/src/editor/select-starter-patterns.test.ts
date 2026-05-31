import { describe, expect, test } from "vitest";

import type { PatternManifestEntry } from "@plumix/core/manifest";

import { selectStarterPatterns } from "./select-starter-patterns.js";

const blank = (
  overrides: Partial<PatternManifestEntry> & { readonly name: string },
): PatternManifestEntry => ({
  title: overrides.name,
  content: [],
  ...overrides,
});

describe("selectStarterPatterns", () => {
  test("includes only patterns with target === 'post-content'", () => {
    const candidates = selectStarterPatterns(
      [
        blank({ name: "starter/in", target: "post-content" }),
        blank({ name: "starter/no-target" }),
      ],
      "page",
    );

    expect(candidates.map((p) => p.name)).toEqual(["starter/in"]);
  });

  test("filters by entryTypes when set; accepts when unset", () => {
    const candidates = selectStarterPatterns(
      [
        blank({
          name: "starter/page-only",
          target: "post-content",
          entryTypes: ["page"],
        }),
        blank({
          name: "starter/post-only",
          target: "post-content",
          entryTypes: ["post"],
        }),
        blank({ name: "starter/any-type", target: "post-content" }),
      ],
      "page",
    );

    expect(candidates.map((p) => p.name).sort()).toEqual([
      "starter/any-type",
      "starter/page-only",
    ]);
  });

  test("sorts by priority asc, then name asc", () => {
    const candidates = selectStarterPatterns(
      [
        blank({
          name: "starter/zeta",
          target: "post-content",
          priority: 1,
        }),
        blank({
          name: "starter/alpha",
          target: "post-content",
          priority: 1,
        }),
        blank({ name: "starter/no-prio", target: "post-content" }),
        blank({
          name: "starter/high",
          target: "post-content",
          priority: -5,
        }),
      ],
      "page",
    );

    expect(candidates.map((p) => p.name)).toEqual([
      "starter/high",
      "starter/alpha",
      "starter/zeta",
      "starter/no-prio",
    ]);
  });
});
