import { describe, expect, test } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import { renderBlockTreeToHtml } from "../test/index.js";
import { sectionBlock } from "./index.js";

describe("core/section", () => {
  test("renders a <section> with a centered max-width inner wrapper", () => {
    const tree: readonly BlockNode[] = [
      { id: "s1", name: "core/section", attrs: { maxWidth: "960px" } },
    ];

    const html = renderBlockTreeToHtml([sectionBlock], tree);

    expect(html).toContain("<section");
    expect(html).toContain("max-width:960px");
    expect(html).toContain("margin-inline:auto");
  });

  test("falls back to a default content max width", () => {
    const tree: readonly BlockNode[] = [
      { id: "s1", name: "core/section", attrs: {} },
    ];

    const html = renderBlockTreeToHtml([sectionBlock], tree);

    expect(html).toContain("max-width:1200px");
  });

  test("seeds padding but no viewport-breaking width (no overflow)", () => {
    const large = sectionBlock.defaultStyles?.large ?? {};
    expect(large.paddingTop).toBe("3rem");
    // No `width: 100vw` / negative margin — that full-bleed overflows by the
    // scrollbar width and adds a horizontal scrollbar; it stays opt-in.
    expect(large.width).toBeUndefined();
    expect(large.marginLeft).toBeUndefined();
  });
});
