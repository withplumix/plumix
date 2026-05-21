import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import { createBlockRegistry } from "../block-registry.js";
import { renderBlockTree } from "../render-block-tree.js";
import { paragraphBlock } from "./index.js";

describe("core/paragraph end-to-end through new defineBlock + walker + style emitter", () => {
  test("renders inline marks from the HTML body string", () => {
    const registry = createBlockRegistry([paragraphBlock]);
    const tree: readonly BlockNode[] = [
      {
        id: "p1",
        name: "core/paragraph",
        attrs: { body: "<p>Hello <strong>world</strong></p>" },
      },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe(
      '<div data-plumix-block="core/paragraph"><div><p>Hello <strong>world</strong></p></div></div>',
    );
  });

  test("renders the HTML body wrapped in data-plumix-block", () => {
    const registry = createBlockRegistry([paragraphBlock]);
    const tree: readonly BlockNode[] = [
      {
        id: "p1",
        name: "core/paragraph",
        attrs: { body: "<p>Hello, world</p>" },
      },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe(
      '<div data-plumix-block="core/paragraph"><div><p>Hello, world</p></div></div>',
    );
  });

  test("renders the desktop-first responsive @media cascade for a style slot override", () => {
    const registry = createBlockRegistry([paragraphBlock]);
    const tree: readonly BlockNode[] = [
      {
        id: "p1",
        name: "core/paragraph",
        attrs: { body: "<p>Cascading</p>" },
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
