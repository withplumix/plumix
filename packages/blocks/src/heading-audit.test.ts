import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { analyzeHeadingStructure } from "./heading-audit.js";

// Headings are inline formats of the unified rich-text block, so the audit
// reads them from each block's body HTML. This helper wraps one heading in a
// rich-text body whose block id is what violations point back at.
function heading(id: string, level: number, text = "OK"): BlockNode {
  return {
    id,
    name: "core/rich-text",
    attrs: { body: `<h${level}>${text}</h${level}>` },
  };
}

describe("analyzeHeadingStructure", () => {
  test("returns [] for empty input", () => {
    expect(analyzeHeadingStructure([])).toEqual([]);
  });

  test("returns [] when no rich-text body contains a heading", () => {
    expect(
      analyzeHeadingStructure([
        { id: "p", name: "core/rich-text", attrs: { body: "<p>prose</p>" } },
      ]),
    ).toEqual([]);
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

  test("flags multiple h1 with all offending block ids", () => {
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

  test("flags an empty heading (empty + whitespace-only bodies count)", () => {
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

  test("reads several headings from one rich-text body in document order", () => {
    const violations = analyzeHeadingStructure([
      {
        id: "block",
        name: "core/rich-text",
        attrs: { body: "<h1>One</h1><p>x</p><h3>Three</h3>" },
      },
    ]);

    // Both headings come from the same block, so the skip points at its id.
    expect(violations).toEqual([
      { kind: "skipped-level", nodeId: "block", from: 1, to: 3 },
    ]);
  });

  test("does not flag a heading whose text is only inline markup", () => {
    expect(
      analyzeHeadingStructure([
        {
          id: "rich",
          name: "core/rich-text",
          attrs: { body: "<h1>Hello <strong>there</strong></h1>" },
        },
      ]),
    ).toEqual([]);
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

  test("does not crash on an attribute that looks like a BlockNode[] but isn't a slot", () => {
    // An attribute that happens to be an array of {id,name} objects (e.g. a
    // term picker producing taxonomy refs) should be walked safely without
    // surfacing false-positive headings.
    const violations = analyzeHeadingStructure([
      {
        id: "outer",
        name: "core/rich-text",
        attrs: {
          body: "<h1>Title</h1>",
          terms: [
            { id: "t1", name: "tag:foo" },
            { id: "t2", name: "tag:bar" },
          ],
        },
      },
    ]);

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
