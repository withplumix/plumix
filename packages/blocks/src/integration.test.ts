import { describe, expect, test } from "vitest";

import { renderTiptapContent } from "@plumix/core";

import { coreBlocks } from "./core-blocks.js";
import { mockRegistry, renderBlock } from "./test/index.js";

/**
 * Parity check: paragraph content authored against the legacy
 * StarterKit schema (`type: "paragraph"`) renders to the same HTML
 * through the new walker as through the existing
 * `renderTiptapContent` walker shipped in `@plumix/core`.
 *
 * This is the foundation tracer-bullet's load-bearing claim: the new
 * pipeline does not silently break existing entries.
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
