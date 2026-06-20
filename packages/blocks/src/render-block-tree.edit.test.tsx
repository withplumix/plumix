import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { createBlockRegistry } from "./block-registry.js";
import { headingBlock } from "./heading/index.js";
import { renderBlockTree } from "./render-block-tree.js";

const registry = createBlockRegistry([headingBlock]);
const tree: readonly BlockNode[] = [
  { id: "abc", name: "core/heading", attrs: { text: "Hi", level: 2 } },
];

describe("renderBlockTree edit-aware seam", () => {
  test("editing tags each block wrapper with its id for canvas selection", () => {
    const html = renderToStaticMarkup(
      renderBlockTree(tree, registry, { editing: true }),
    );

    expect(html).toContain('data-plumix-id="abc"');
  });

  test("the normal (non-editing) render carries no editor annotations", () => {
    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).not.toContain("data-plumix-id");
  });
});
