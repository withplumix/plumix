import { describe, expect, test } from "vitest";

import { byPriorityThen } from "@plumix/core/manifest";

import type { InserterPattern } from "./block-catalog.js";
import { selectStarterPatterns } from "./select-starter-patterns.js";

const blank = (
  overrides: Partial<InserterPattern> & { readonly name: string },
): InserterPattern => ({
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

  test("keeps only unrestricted patterns when the entry type is unknown", () => {
    const candidates = selectStarterPatterns(
      [
        blank({
          name: "starter/typed",
          target: "post-content",
          entryTypes: ["page"],
        }),
        blank({ name: "starter/any", target: "post-content" }),
      ],
      undefined,
    );

    expect(candidates.map((p) => p.name)).toEqual(["starter/any"]);
  });

  test("sorts by priority asc, then name asc", () => {
    const candidates = selectStarterPatterns(
      [
        blank({ name: "starter/zeta", target: "post-content", priority: 1 }),
        blank({ name: "starter/alpha", target: "post-content", priority: 1 }),
        blank({ name: "starter/no-prio", target: "post-content" }),
        blank({ name: "starter/high", target: "post-content", priority: -5 }),
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

  test("orders identically to a direct byPriorityThen sort", () => {
    const patterns = [
      blank({ name: "starter/b", target: "post-content", priority: 2 }),
      blank({ name: "starter/a", target: "post-content", priority: 2 }),
    ];

    expect(selectStarterPatterns(patterns, "page")).toEqual(
      [...patterns].sort(byPriorityThen((p) => p.name)),
    );
  });
});
