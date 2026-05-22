import { describe, expect, test } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import { richTextBlock } from "../rich-text/index.js";
import { renderBlockTreeToHtml } from "../test/index.js";
import { columnsBlock } from "./index.js";

describe("core/columns", () => {
  test("renders an empty two-column layout with the default gap", () => {
    const tree: readonly BlockNode[] = [
      { id: "c1", name: "core/columns", attrs: {} },
    ];

    const html = renderBlockTreeToHtml([columnsBlock], tree);

    expect(html).toContain('data-plumix-columns="true"');
    expect(html).toContain('data-gap="md"');
    expect(html).toContain('data-plumix-column="left"');
    expect(html).toContain('data-plumix-column="right"');
  });

  test("renders the declared gap when valid", () => {
    const tree: readonly BlockNode[] = [
      { id: "c1", name: "core/columns", attrs: { gap: "lg" } },
    ];

    const html = renderBlockTreeToHtml([columnsBlock], tree);

    expect(html).toContain('data-gap="lg"');
  });

  test("renders nested blocks in their respective slot columns", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "c1",
        name: "core/columns",
        attrs: {
          left: [
            {
              id: "p1",
              name: "core/rich-text",
              attrs: { body: "<p>L</p>" },
            },
          ],
          right: [
            {
              id: "p2",
              name: "core/rich-text",
              attrs: { body: "<p>R</p>" },
            },
          ],
        },
      },
    ];

    const html = renderBlockTreeToHtml([columnsBlock, richTextBlock], tree);

    expect(html).toContain(
      '<div data-plumix-column="left"><div data-plumix-block="core/rich-text"><div><p>L</p></div></div></div>',
    );
    expect(html).toContain(
      '<div data-plumix-column="right"><div data-plumix-block="core/rich-text"><div><p>R</p></div></div></div>',
    );
  });
});
