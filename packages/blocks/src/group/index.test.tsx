import type { BlockNode } from "../render-block-tree.js";
import { describe, expect, test } from "vitest";

import { renderBlockTreeToHtml } from "../test/index.js";
import { paragraphBlockV2 } from "../paragraph/v2.js";
import { groupBlockV2 } from "./v2.js";

describe("core/group v2", () => {
  test("renders an empty group with the default flow layout", () => {
    const tree: readonly BlockNode[] = [
      { id: "g1", name: "core/group", attrs: {} },
    ];

    const html = renderBlockTreeToHtml([groupBlockV2], tree);

    expect(html).toBe(
      '<div data-plumix-block="core/group"><div data-layout="flow"></div></div>',
    );
  });

  test("renders the declared layout when valid", () => {
    const tree: readonly BlockNode[] = [
      { id: "g1", name: "core/group", attrs: { layout: "flex-row" } },
    ];

    const html = renderBlockTreeToHtml([groupBlockV2], tree);

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
      [groupBlockV2, paragraphBlockV2],
      tree,
    );

    expect(html).toContain(
      '<div data-plumix-block="core/paragraph"><p>Inside group</p></div>',
    );
  });
});
