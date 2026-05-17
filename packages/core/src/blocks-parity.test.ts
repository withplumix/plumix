/**
 * @vitest-environment jsdom
 *
 * jsdom is required only for this file — `@plumix/blocks`'s
 * `<EntryContent>` walker is React-based and the parity assertions
 * render via `renderToStaticMarkup`. The rest of `@plumix/core`'s
 * tests run in the default node environment (jsdom breaks Buffer /
 * Uint8Array semantics used by the passkey suites).
 */
import { describe, expect, test } from "vitest";

import { coreBlocks } from "@plumix/blocks";
import { mockRegistry, renderBlock } from "@plumix/blocks/test";

import { renderTiptapContent } from "./route/render/tiptap.js";

/**
 * Parity check: paragraph content authored against the legacy
 * StarterKit schema (`type: "paragraph"`) renders to the same HTML
 * through the new `<EntryContent>` walker as through the existing
 * `renderTiptapContent` HTML walker shipped in this package.
 *
 * Lives in `@plumix/core` (rather than `@plumix/blocks`) because the
 * legacy walker is core-owned and `@plumix/blocks` should not depend
 * on `@plumix/core` — that would create a workspace dependency cycle.
 *
 * Load-bearing for the foundation slice: proves the new registry-driven
 * pipeline does not silently break entries authored before the
 * namespaced spec system landed.
 */
describe("paragraph parity against the legacy walker", () => {
  test("plain paragraph", async () => {
    const registry = await mockRegistry({ core: [...coreBlocks] });
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
    };
    const legacy = renderTiptapContent(doc);
    const next = renderBlock({ registry, content: doc });
    expect(next).toBe(legacy);
  });

  test("paragraph with bold + italic marks", async () => {
    const registry = await mockRegistry({ core: [...coreBlocks] });
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Hi",
              marks: [{ type: "bold" }, { type: "italic" }],
            },
          ],
        },
      ],
    };
    expect(renderBlock({ registry, content: doc })).toBe(
      renderTiptapContent(doc),
    );
  });

  test.each([1, 2, 3, 4, 5, 6])(
    "heading level=%i renders identically (legacy `type: heading`)",
    async (level) => {
      const registry = await mockRegistry({ core: [...coreBlocks] });
      const doc = {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level },
            content: [{ type: "text", text: "Title" }],
          },
        ],
      };
      expect(renderBlock({ registry, content: doc })).toBe(
        renderTiptapContent(doc),
      );
    },
  );

  test("bulletList legacy content renders identically to <ul>", async () => {
    const registry = await mockRegistry({ core: [...coreBlocks] });
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "text", text: "a" }],
            },
            {
              type: "listItem",
              content: [{ type: "text", text: "b" }],
            },
          ],
        },
      ],
    };
    expect(renderBlock({ registry, content: doc })).toBe(
      renderTiptapContent(doc),
    );
  });

  test("orderedList legacy content renders identically to <ol>", async () => {
    // The legacy walker drops `start` / `reversed` attrs entirely — for
    // parity we test the shape both walkers agree on (no numbering
    // attrs). The new walker's start / reversed handling is exercised
    // in @plumix/blocks's list suite.
    const registry = await mockRegistry({ core: [...coreBlocks] });
    const doc = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "text", text: "first" }],
            },
          ],
        },
      ],
    };
    expect(renderBlock({ registry, content: doc })).toBe(
      renderTiptapContent(doc),
    );
  });

  test("heading with out-of-range level clamps identically", async () => {
    const registry = await mockRegistry({ core: [...coreBlocks] });
    const doc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 9 },
          content: [{ type: "text", text: "Title" }],
        },
      ],
    };
    expect(renderBlock({ registry, content: doc })).toBe(
      renderTiptapContent(doc),
    );
  });

  test("paragraph with a safe link", async () => {
    const registry = await mockRegistry({ core: [...coreBlocks] });
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    };
    expect(renderBlock({ registry, content: doc })).toBe(
      renderTiptapContent(doc),
    );
  });
});
