import { describe, expect, test } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import { analyzeHeadingStructure } from "./audit.js";

function heading(id: string, level: number, text = "OK"): BlockNode {
  return { id, name: "core/heading", attrs: { level, text } };
}

describe("analyzeHeadingStructure", () => {
  test("returns [] for empty input", () => {
    expect(analyzeHeadingStructure([])).toEqual([]);
  });

  test("returns [] for a single well-formed heading", () => {
    expect(analyzeHeadingStructure([heading("h", 1)])).toEqual([]);
  });

  test("returns [] for a strictly ascending heading sequence (h1 → h2 → h3)", () => {
    expect(
      analyzeHeadingStructure([
        heading("a", 1),
        heading("b", 2),
        heading("c", 3),
      ]),
    ).toEqual([]);
  });

  test("flags multiple h1 with all offending node ids", () => {
    const violations = analyzeHeadingStructure([
      heading("first", 1),
      heading("middle", 2),
      heading("second", 1),
    ]);

    expect(violations).toEqual([
      { kind: "multiple-h1", nodeIds: ["first", "second"] },
    ]);
  });

  test("flags a skipped level when the next heading jumps more than one", () => {
    const violations = analyzeHeadingStructure([
      heading("a", 1),
      heading("b", 3),
    ]);

    expect(violations).toEqual([
      { kind: "skipped-level", nodeId: "b", from: 1, to: 3 },
    ]);
  });

  test("does not flag descending steps (h3 → h2 → h1 is allowed)", () => {
    expect(
      analyzeHeadingStructure([
        heading("a", 3),
        heading("b", 2),
        heading("c", 1),
      ]),
    ).toEqual([]);
  });

  test("flags an empty heading (empty text + whitespace-only counts)", () => {
    const violations = analyzeHeadingStructure([
      heading("good", 1, "title"),
      heading("blank", 2, ""),
      heading("whitespace", 2, "   "),
    ]);

    expect(violations).toEqual([
      { kind: "empty-heading", nodeId: "blank" },
      { kind: "empty-heading", nodeId: "whitespace" },
    ]);
  });

  test("walks slot-typed BlockNode[] arrays inside attrs to find nested headings", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "section",
        name: "core/section",
        attrs: {
          content: [heading("inside", 1), heading("nested-skip", 3)],
        },
      },
    ];

    const violations = analyzeHeadingStructure(tree);

    expect(violations).toEqual([
      { kind: "skipped-level", nodeId: "nested-skip", from: 1, to: 3 },
    ]);
  });

  test("clamps invalid/out-of-range levels to 2 (default)", () => {
    const violations = analyzeHeadingStructure([
      heading("a", 1),
      heading("nan", 9),
      heading("after", 3),
    ]);

    // The bogus h9 is treated as level 2, so a(1) → nan(2) is fine, but
    // nan(2) → after(3) is also fine. Net: zero violations.
    expect(violations).toEqual([]);
  });

  test("clamps every invalid-level shape (0, negative, fractional, undefined, string) to 2", () => {
    for (const level of [0, -1, 1.5, undefined, "2"] as unknown[]) {
      const violations = analyzeHeadingStructure([
        { id: "x", name: "core/heading", attrs: { level, text: "OK" } },
        heading("after", 3),
      ]);
      // x clamps to 2, after is 3 — no skip, no violation.
      expect(violations).toEqual([]);
    }
  });

  test("does not crash on an attribute that looks like a BlockNode[] but isn't a slot", () => {
    // An attribute that happens to be an array of {id,name} objects (e.g. a
    // term picker producing taxonomy refs) should be walked safely. The
    // shape-detection heuristic is documented; this test pins the boundary.
    const violations = analyzeHeadingStructure([
      {
        id: "outer",
        name: "core/heading",
        attrs: {
          level: 1,
          text: "Title",
          terms: [
            { id: "t1", name: "tag:foo" },
            { id: "t2", name: "tag:bar" },
          ],
        },
      },
    ]);

    // Outer heading is well-formed; the term-shaped attr's items have
    // names that aren't `core/heading` so no false-positive headings appear.
    expect(violations).toEqual([]);
  });

  test("emits multiple distinct violations for one tree (multiple-h1 + skipped-level + empty)", () => {
    const violations = analyzeHeadingStructure([
      heading("h1a", 1, "First H1"),
      heading("h1b", 1, ""),
      heading("h4", 4, "Skipped"),
    ]);

    expect(violations).toEqual([
      { kind: "multiple-h1", nodeIds: ["h1a", "h1b"] },
      { kind: "empty-heading", nodeId: "h1b" },
      { kind: "skipped-level", nodeId: "h4", from: 1, to: 4 },
    ]);
  });
});
