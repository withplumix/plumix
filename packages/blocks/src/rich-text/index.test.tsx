import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import type { ShortcodeSpec } from "../shortcodes/types.js";
import { createBlockRegistry } from "../block-registry.js";
import { renderBlockTree } from "../render-block-tree.js";
import { richTextBlock } from "./index.js";

describe("core/rich-text walker render", () => {
  test("renders the default empty body as a single wrapped paragraph", () => {
    const registry = createBlockRegistry([richTextBlock]);
    const tree: readonly BlockNode[] = [
      { id: "r1", name: "core/rich-text", attrs: { body: "<p></p>" } },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe(
      '<div data-plumix-block="core/rich-text"><div><p></p></div></div>',
    );
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

  test("returns the admin's React-element body verbatim so Tiptap mounts inline", () => {
    // The admin preview wraps `attrs.body` as a <RichTextRender> element
    // before calling the block render. Wrapping that element in another
    // <div dangerouslySetInnerHTML> would mount the editor on a stale
    // snapshot and lose focus after the first keystroke (the bug #471
    // fixed for the paragraph block). The block must surface the element
    // directly.
    const registry = createBlockRegistry([richTextBlock]);
    const adminElement = (
      <div data-editor-portal="true">
        <span>inline editor mock</span>
      </div>
    );
    const tree: readonly BlockNode[] = [
      { id: "r1", name: "core/rich-text", attrs: { body: adminElement } },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe(
      '<div data-plumix-block="core/rich-text"><div data-editor-portal="true"><span>inline editor mock</span></div></div>',
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

    expect(html).toBe(
      `<div data-plumix-block="core/rich-text"><div>${body}</div></div>`,
    );
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
