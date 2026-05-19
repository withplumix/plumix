import type { BlockNode } from "../render-block-tree.js";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "../block-registry.js";
import { renderBlockTree } from "../render-block-tree.js";
import { paragraphBlockV2 } from "./v2.js";

describe("core/paragraph end-to-end through new defineBlock + walker + style emitter", () => {
  test("renders a <p> wrapped in data-plumix-block", () => {
    const registry = createBlockRegistry([paragraphBlockV2]);
    const tree: readonly BlockNode[] = [
      {
        id: "p1",
        name: "core/paragraph",
        attrs: { text: "Hello, world" },
      },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe(
      '<div data-plumix-block="core/paragraph"><p>Hello, world</p></div>',
    );
  });

  test("renders the desktop-first responsive @media cascade for a style slot override", () => {
    const registry = createBlockRegistry([paragraphBlockV2]);
    const tree: readonly BlockNode[] = [
      {
        id: "p1",
        name: "core/paragraph",
        attrs: { text: "Cascading" },
        style: {
          large: { padding: "lg" },
          small: { padding: "sm" },
        },
      },
    ];

    const html = renderToStaticMarkup(
      renderBlockTree(tree, registry, {
        tokens: {
          spacing: { lg: { value: "24px" }, sm: { value: "8px" } },
        },
      }),
    );

    expect(html).toContain('class="plumix-block-p1"');
    expect(html).toContain(
      ".plumix-block-p1 { padding: var(--plumix-spacing-lg, 24px); }",
    );
    expect(html).toContain(
      "@media (max-width: 640px) { .plumix-block-p1 { padding: var(--plumix-spacing-sm, 8px); } }",
    );
    expect(html).toContain("<p>Cascading</p>");
  });
});
