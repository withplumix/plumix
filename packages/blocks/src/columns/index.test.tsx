import type { BlockNode } from "../render-block-tree.js";
import { describe, expect, test } from "vitest";

import { renderBlockTreeToHtml } from "../test/index.js";
import { paragraphBlockV2 } from "../paragraph/v2.js";
import { columnsBlockV2 } from "./v2.js";

describe("core/columns v2", () => {
  test("renders an empty two-column layout with the default gap", () => {
    const tree: readonly BlockNode[] = [
      { id: "c1", name: "core/columns", attrs: {} },
    ];

    const html = renderBlockTreeToHtml([columnsBlockV2], tree);

    expect(html).toContain('data-plumix-columns="true"');
    expect(html).toContain('data-gap="md"');
    expect(html).toContain('data-plumix-column="left"');
    expect(html).toContain('data-plumix-column="right"');
  });

  test("renders the declared gap when valid", () => {
    const tree: readonly BlockNode[] = [
      { id: "c1", name: "core/columns", attrs: { gap: "lg" } },
    ];

    const html = renderBlockTreeToHtml([columnsBlockV2], tree);

    expect(html).toContain('data-gap="lg"');
  });

  test("renders nested blocks in their respective slot columns", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "c1",
        name: "core/columns",
        attrs: {
          left: [
            { id: "p1", name: "core/paragraph", attrs: { text: "L" } },
          ],
          right: [
            { id: "p2", name: "core/paragraph", attrs: { text: "R" } },
          ],
        },
      },
    ];

    const html = renderBlockTreeToHtml(
      [columnsBlockV2, paragraphBlockV2],
      tree,
    );

    expect(html).toContain(
      '<div data-plumix-column="left"><div data-plumix-block="core/paragraph"><p>L</p></div></div>',
    );
    expect(html).toContain(
      '<div data-plumix-column="right"><div data-plumix-block="core/paragraph"><p>R</p></div></div>',
    );
  });
});
