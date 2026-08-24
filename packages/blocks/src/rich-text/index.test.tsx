import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import type { ShortcodeSpec } from "../shortcodes/types.js";
import { createBlockRegistry } from "../block-registry.js";
import {
  DEFAULT_BLOCK_CONTEXT,
  renderBlockTree,
} from "../render-block-tree.js";
import { richTextBlock } from "./index.js";

describe("core/rich-text walker render", () => {
  test("renders an explicitly empty body as a single wrapped paragraph", () => {
    const registry = createBlockRegistry([richTextBlock]);
    const tree: readonly BlockNode[] = [
      { id: "r1", name: "core/rich-text", attrs: { body: "<p></p>" } },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe("<div><div><p></p></div></div>");
  });

  test("seeds visible placeholder copy in the insert default", () => {
    // An empty <p></p> default renders zero-height — invisible/unclickable on
    // the canvas — so the insert default must seed visible copy.
    const registry = createBlockRegistry([richTextBlock]);
    const tree: readonly BlockNode[] = [
      { id: "r1", name: "core/rich-text", attrs: richTextBlock.defaults },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toContain("Enter text here…");
  });

  test("strips a <script> from a string body so stored markup can't XSS", () => {
    const registry = createBlockRegistry([richTextBlock]);
    const tree: readonly BlockNode[] = [
      {
        id: "r1",
        name: "core/rich-text",
        attrs: { body: "<p>hi</p><script>alert(1)</script>" },
      },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).not.toContain("<script>");
    expect(html).toContain("<p>hi</p>");
  });

  test("returns a React-element body verbatim rather than re-wrapping it", () => {
    // Driven through `render`, not the walker: stored attrs are JSON, so no
    // tree can carry an element. See the note in `index.tsx`.
    const RichText = richTextBlock.render;
    const adminElement = (
      <div data-editor-portal="true">
        <span>inline editor mock</span>
      </div>
    );

    const html = renderToStaticMarkup(
      <RichText
        attrs={{ body: adminElement }}
        context={DEFAULT_BLOCK_CONTEXT}
        loaders={{}}
        blockProps={{}}
      />,
    );

    expect(html).toBe(
      '<div data-editor-portal="true"><span>inline editor mock</span></div>',
    );
  });

  test("hydrates a multi-element HTML body verbatim (lists, headings, marks)", () => {
    const registry = createBlockRegistry([richTextBlock]);
    const body =
      "<h2>Intro</h2><ul><li>First</li><li><strong>Second</strong></li></ul>";
    const tree: readonly BlockNode[] = [
      { id: "r1", name: "core/rich-text", attrs: { body } },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe(`<div><div>${body}</div></div>`);
  });

  describe("shortcode body expansion", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-12T00:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const yearShortcode: ShortcodeSpec = {
      name: "year",
      render: ({ context }) =>
        new Intl.DateTimeFormat(context.locale, { year: "numeric" }).format(
          new Date(),
        ),
    };

    test("expands a registered shortcode in the stored HTML body", () => {
      const registry = createBlockRegistry([richTextBlock]);
      const tree: readonly BlockNode[] = [
        {
          id: "r1",
          name: "core/rich-text",
          attrs: { body: "<p>Best Shoes for [year]</p>" },
        },
      ];

      const html = renderToStaticMarkup(
        renderBlockTree(tree, registry, {
          shortcodes: new Map([[yearShortcode.name, yearShortcode]]),
          locale: "en",
        }),
      );

      expect(html).toContain("Best Shoes for 2026");
    });

    test("leaves the body untouched when no registry is threaded", () => {
      const registry = createBlockRegistry([richTextBlock]);
      const tree: readonly BlockNode[] = [
        {
          id: "r1",
          name: "core/rich-text",
          attrs: { body: "<p>Best Shoes for [year]</p>" },
        },
      ];

      const html = renderToStaticMarkup(renderBlockTree(tree, registry));

      expect(html).toContain("Best Shoes for [year]");
    });
  });
});
