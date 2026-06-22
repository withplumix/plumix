import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import { createBlockRegistry } from "../block-registry.js";
import { renderBlockTree } from "../render-block-tree.js";
import { headingBlock } from "./index.js";

describe("core/heading end-to-end through new defineBlock + flat registry + walker", () => {
  test("renders the heading tag at the declared level, seam on the element", () => {
    const registry = createBlockRegistry([headingBlock]);
    const tree: readonly BlockNode[] = [
      {
        id: "1",
        name: "core/heading",
        attrs: { text: "Section title", level: 2 },
      },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    // selfSeam: the seam rides on the <h2> itself, no wrapper <div>.
    expect(html).toBe(
      '<h2 data-plumix-block="core/heading">Section title</h2>',
    );
  });

  test("falls back to h2 when level is not in attrs", () => {
    const registry = createBlockRegistry([headingBlock]);
    const tree: readonly BlockNode[] = [
      {
        id: "1",
        name: "core/heading",
        attrs: { text: "Defaulted" },
      },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toContain(
      '<h2 data-plumix-block="core/heading">Defaulted</h2>',
    );
  });
});
