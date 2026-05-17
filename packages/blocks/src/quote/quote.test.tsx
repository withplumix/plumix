import { describe, expect, test } from "vitest";

import { paragraphBlock } from "../paragraph/index.js";
import { mockRegistry, renderBlock } from "../test/index.js";
import { quoteBlock } from "./index.js";

describe("core/quote", () => {
  test("emits the cite attribute when citation is a non-empty string", async () => {
    const registry = await mockRegistry({
      core: [quoteBlock, paragraphBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/quote",
            attrs: { citation: "https://example.com/source" },
            content: [
              {
                type: "core/paragraph",
                content: [{ type: "text", text: "Wisdom" }],
              },
            ],
          },
        ],
      },
    });
    expect(html).toContain('cite="https://example.com/source"');
  });

  test("omits cite when citation attr is empty or non-string", async () => {
    const registry = await mockRegistry({
      core: [quoteBlock, paragraphBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/quote",
            attrs: { citation: "" },
            content: [
              {
                type: "core/paragraph",
                content: [{ type: "text", text: "X" }],
              },
            ],
          },
          {
            type: "core/quote",
            attrs: { citation: 42 },
            content: [
              {
                type: "core/paragraph",
                content: [{ type: "text", text: "Y" }],
              },
            ],
          },
        ],
      },
    });
    expect(html).not.toContain("cite=");
  });

  test("renders as <blockquote> wrapping children", async () => {
    const registry = await mockRegistry({
      core: [quoteBlock, paragraphBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/quote",
            content: [
              {
                type: "core/paragraph",
                content: [{ type: "text", text: "Wisdom" }],
              },
            ],
          },
        ],
      },
    });
    expect(html).toBe(
      '<blockquote data-plumix-block="core/quote"><p>Wisdom</p></blockquote>',
    );
  });
});
