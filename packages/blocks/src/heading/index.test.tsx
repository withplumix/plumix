import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import { createBlockRegistry } from "../block-registry.js";
import { renderBlockTree } from "../render-block-tree.js";
import { headingBlock } from "./index.js";

describe("core/heading end-to-end through new defineBlock + flat registry + walker", () => {
  test("renders the heading tag at the declared level with the wrapper", () => {
    const registry = createBlockRegistry([headingBlock]);
    const tree: readonly BlockNode[] = [
      {
        id: "1",
        name: "core/heading",
        attrs: { text: "Section title", level: 2 },
      },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe(
      '<div data-plumix-block="core/heading"><h2>Section title</h2></div>',
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

    expect(html).toContain("<h2>Defaulted</h2>");
  });
});
