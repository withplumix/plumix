import type { BlockNode } from "../render-block-tree.js";
import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import { paragraphBlockV2 } from "../paragraph/v2.js";
import { detailsBlockV2 } from "./v2.js";

describe("core/details v2", () => {
  test("falls back to 'Details' summary when summary is empty", () => {
    const html = renderBlockSpecToHtml(detailsBlockV2, {});

    expect(html).toContain("<summary>Details</summary>");
    expect(html).not.toContain("open=");
  });

  test("renders the declared summary and opens when open=true", () => {
    const html = renderBlockSpecToHtml(detailsBlockV2, {
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

    const html = renderBlockTreeToHtml([detailsBlockV2, paragraphBlockV2], tree);

    expect(html).toContain("<p>Hidden</p>");
  });
});
