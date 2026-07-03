import { describe, expect, test } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import { richTextBlock } from "../rich-text/index.js";
import { renderBlockTreeToHtml } from "../test/index.js";
import { groupBlock } from "./index.js";

describe("core/group", () => {
  test("renders an empty box as a bare seam div (no layout prop)", () => {
    const tree: readonly BlockNode[] = [
      { id: "g1", name: "core/group", attrs: {} },
    ];

    const html = renderBlockTreeToHtml([groupBlock], tree);

    expect(html).toBe("<div></div>");
  });

  test("renders nested blocks from the content slot", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "g1",
        name: "core/group",
        attrs: {
          content: [
            {
              id: "p1",
              name: "core/rich-text",
              attrs: { body: "<p>Inside group</p>" },
            },
          ],
        },
      },
    ];

    const html = renderBlockTreeToHtml([groupBlock, richTextBlock], tree);

    expect(html).toContain("<div><div><p>Inside group</p></div></div>");
  });
});
