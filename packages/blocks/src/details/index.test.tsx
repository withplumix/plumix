import type { BlockNode } from "../render-block-tree.js";
import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import { paragraphBlock } from "../paragraph/index.js";
import { detailsBlock } from "./index.js";

describe("core/details", () => {
  test("falls back to 'Details' summary when summary is empty", () => {
    const html = renderBlockSpecToHtml(detailsBlock, {});

    expect(html).toContain("<summary>Details</summary>");
    expect(html).not.toContain("open=");
  });

  test("renders the declared summary and opens when open=true", () => {
    const html = renderBlockSpecToHtml(detailsBlock, {
      summary: "Long version",
      open: true,
    });

    expect(html).toContain("<summary>Long version</summary>");
    expect(html).toContain('<details open=""');
  });

  test("renders nested blocks from the content slot", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "d1",
        name: "core/details",
        attrs: {
          summary: "More",
          content: [{ id: "p1", name: "core/paragraph", attrs: { text: "Hidden" } }],
        },
      },
    ];

    const html = renderBlockTreeToHtml([detailsBlock, paragraphBlock], tree);

    expect(html).toContain("<p>Hidden</p>");
  });
});
