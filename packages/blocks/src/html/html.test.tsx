import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
import { htmlBlock } from "./index.js";

describe("core/html", () => {
  test("preserves allowlisted markup verbatim inside the marker div", async () => {
    const registry = await mockRegistry({ core: [htmlBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/html",
            attrs: { html: "<p><strong>Bold</strong></p>" },
          },
        ],
      },
    });
    expect(html).toBe(
      '<div data-plumix-block="core/html"><p><strong>Bold</strong></p></div>',
    );
  });

  test("routes the html attr through the sanitizer", async () => {
    const registry = await mockRegistry({ core: [htmlBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/html",
            attrs: { html: "<p>safe</p><script>alert(1)</script>" },
          },
        ],
      },
    });
    expect(html).toBe('<div data-plumix-block="core/html"><p>safe</p></div>');
  });

  test("renders an empty marker div when html attr is missing or non-string", async () => {
    const registry = await mockRegistry({ core: [htmlBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          { type: "core/html" },
          { type: "core/html", attrs: { html: 42 } },
        ],
      },
    });
    expect(html).toBe(
      '<div data-plumix-block="core/html"></div><div data-plumix-block="core/html"></div>',
    );
  });
});
