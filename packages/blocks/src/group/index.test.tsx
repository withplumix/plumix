import type { BlockNode } from "../render-block-tree.js";
import { describe, expect, test } from "vitest";

import { renderBlockTreeToHtml } from "../test/index.js";
import { paragraphBlock } from "../paragraph/index.js";
import { groupBlock } from "./index.js";

describe("core/group", () => {
  test("renders an empty group with the default flow layout", () => {
    const tree: readonly BlockNode[] = [
      { id: "g1", name: "core/group", attrs: {} },
    ];

    const html = renderBlockTreeToHtml([groupBlock], tree);

    expect(html).toBe(
      '<div data-plumix-block="core/group"><div data-layout="flow"></div></div>',
    );
  });

  test("renders the declared layout when valid", () => {
    const tree: readonly BlockNode[] = [
      { id: "g1", name: "core/group", attrs: { layout: "flex-row" } },
    ];

    const html = renderBlockTreeToHtml([groupBlock], tree);

    expect(html).toContain('data-layout="flex-row"');
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
              name: "core/paragraph",
              attrs: { text: "Inside group" },
            },
          ],
        },
      },
    ];

    const html = renderBlockTreeToHtml(
      [groupBlock, paragraphBlock],
      tree,
    );

    expect(html).toContain(
      '<div data-plumix-block="core/paragraph"><p>Inside group</p></div>',
    );
  });
});
