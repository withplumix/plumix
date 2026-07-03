import { describe, expect, test } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import { richTextBlock } from "../rich-text/index.js";
import { renderBlockTreeToHtml } from "../test/index.js";
import { columnBlock } from "./index.js";

describe("core/column", () => {
  test("renders its content slot in a bare seam div (the flex item)", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "col1",
        name: "core/column",
        attrs: {
          content: [
            { id: "p1", name: "core/rich-text", attrs: { body: "<p>Hi</p>" } },
          ],
        },
      },
    ];

    const html = renderBlockTreeToHtml([columnBlock, richTextBlock], tree);

    expect(html).toContain("<p>Hi</p>");
    // selfSeam: no wrapper div, no legacy column data-marker.
    expect(html).not.toContain("data-plumix-column");
  });

  test("seeds an equal-split flex-item default style", () => {
    expect(columnBlock.defaultStyles?.large?.flexGrow).toBe("1");
    expect(columnBlock.defaultStyles?.large?.flexBasis).toBe("0");
    expect(columnBlock.defaultStyles?.large?.minWidth).toBe("0");
  });

  test("is a column only inside core/columns", () => {
    expect(columnBlock.requiresParent).toEqual(["core/columns"]);
  });

  test("a width sets a shrinkable flex-basis, overriding the equal split", () => {
    const tree: readonly BlockNode[] = [
      { id: "col1", name: "core/column", attrs: { width: "30%" } },
    ];

    const html = renderBlockTreeToHtml([columnBlock], tree);

    // Basis with shrink (no grow) — the inline style wins over the class-level
    // equal split, and shrink keeps a full row gap-safe instead of overflowing.
    expect(html).toContain("flex:0 1 30%");
  });

  test("a bare number width is treated as a percent", () => {
    const tree: readonly BlockNode[] = [
      { id: "col1", name: "core/column", attrs: { width: "70" } },
    ];

    const html = renderBlockTreeToHtml([columnBlock], tree);

    expect(html).toContain("flex:0 1 70%");
  });

  test("ignores an unsafe width value (falls back to equal split)", () => {
    const tree: readonly BlockNode[] = [
      { id: "col1", name: "core/column", attrs: { width: "30%;} evil" } },
    ];

    const html = renderBlockTreeToHtml([columnBlock], tree);

    expect(html).not.toContain("flex:");
    expect(html).not.toContain("evil");
  });
});
