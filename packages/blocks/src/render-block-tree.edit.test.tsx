import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { createBlockRegistry } from "./block-registry.js";
import { groupBlock } from "./group/index.js";
import { headingBlock } from "./heading/index.js";
import { renderBlockTree } from "./render-block-tree.js";

const registry = createBlockRegistry([headingBlock, groupBlock]);
const tree: readonly BlockNode[] = [
  { id: "abc", name: "core/heading", attrs: { text: "Hi", level: 2 } },
];

const nested: readonly BlockNode[] = [
  {
    id: "g1",
    name: "core/group",
    attrs: {
      content: [{ id: "h1", name: "core/heading", attrs: { text: "x" } }],
    },
  },
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

  test("editing marks each container slot so the canvas can target nested drops", () => {
    const html = renderToStaticMarkup(
      renderBlockTree(nested, registry, { editing: true }),
    );

    expect(html).toContain('data-plumix-slot="g1:content"');
    // The marker is layout-neutral (display:contents) — the child still renders.
    expect(html).toContain('data-plumix-id="h1"');
  });

  test("editing gives an empty slot a droppable placeholder", () => {
    const empty: readonly BlockNode[] = [
      { id: "g2", name: "core/group", attrs: { content: [] } },
    ];
    const html = renderToStaticMarkup(
      renderBlockTree(empty, registry, { editing: true }),
    );

    expect(html).toContain('data-plumix-slot="g2:content"');
    expect(html).toContain('data-plumix-slot-empty="g2:content"');
  });

  test("the normal render carries no slot markers", () => {
    const html = renderToStaticMarkup(renderBlockTree(nested, registry));

    expect(html).not.toContain("data-plumix-slot");
  });
});
