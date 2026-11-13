import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import type { ShortcodeSpec } from "../shortcodes/types.js";
import { createBlockRegistry } from "../block-registry.js";
import { loadBlockViews } from "../block-views.js";
import {
  DEFAULT_BLOCK_CONTEXT,
  renderBlockTree,
} from "../render-block-tree.js";
import { richTextBlock } from "./index.js";

describe("core/rich-text walker render", () => {
  test("renders an explicitly empty body as a single wrapped paragraph", async () => {
    const registry = createBlockRegistry([richTextBlock]);
    await loadBlockViews(registry);
    const tree: readonly BlockNode[] = [
      { id: "r1", name: "core/rich-text", attrs: { body: "<p></p>" } },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe("<div><div><p></p></div></div>");
  });

  test("seeds visible placeholder copy in the insert default", async () => {
    // An empty <p></p> default renders zero-height — invisible/unclickable on
    // the canvas — so the insert default must seed visible copy.
    const registry = createBlockRegistry([richTextBlock]);
    await loadBlockViews(registry);
    const tree: readonly BlockNode[] = [
      { id: "r1", name: "core/rich-text", attrs: richTextBlock.defaults },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toContain("Enter text here…");
  });

  test("strips a <script> from a string body so stored markup can't XSS", async () => {
    const registry = createBlockRegistry([richTextBlock]);
    await loadBlockViews(registry);
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

  // Driven through the view rather than the walker: `BlockNode.attrs` is JSON,
  // so no tree can express the element case.
  test.each([
    ["a React element", <span>unsanitised</span>],
    ["a number", 42],
    ["an absent body", undefined],
  ])("renders the empty fallback for %s", async (_label, body) => {
    const { default: RichText } = await import("./rich-text.view.js");

    const html = renderToStaticMarkup(
      <RichText
        name="core/rich-text"
        attrs={{ body }}
        context={DEFAULT_BLOCK_CONTEXT}
        loaders={{}}
        deps={{ settings: { site: null } }}
        blockProps={{}}
      />,
    );

    expect(html).toBe("<div></div>");
  });

  test("hydrates a multi-element HTML body verbatim (lists, headings, marks)", async () => {
    const registry = createBlockRegistry([richTextBlock]);
    await loadBlockViews(registry);
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

    test("expands a registered shortcode in the stored HTML body", async () => {
      const registry = createBlockRegistry([richTextBlock]);
      await loadBlockViews(registry);
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

    test("leaves the body untouched when no registry is threaded", async () => {
      const registry = createBlockRegistry([richTextBlock]);
      await loadBlockViews(registry);
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
