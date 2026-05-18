import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock, stripBlockMarkers } from "../test/index.js";
import { codeBlock } from "./index.js";

describe("core/code", () => {
  test("renders <pre><code> with language attribute set", async () => {
    const registry = await mockRegistry({ core: [codeBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/code",
            attrs: { language: "typescript" },
            content: [{ type: "text", text: "const x = 1;" }],
          },
        ],
      },
    });
    expect(stripBlockMarkers(html)).toBe(
      '<pre data-language="typescript"><code data-language="typescript">const x = 1;</code></pre>',
    );
  });

  test("renders <pre> only (no inner <code>) when language is null", async () => {
    const registry = await mockRegistry({ core: [codeBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/code",
            attrs: { language: null },
            content: [{ type: "text", text: "raw text" }],
          },
        ],
      },
    });
    expect(stripBlockMarkers(html)).toBe('<pre>raw text</pre>');
  });

  test("treats non-string language as null (no inner <code>)", async () => {
    const registry = await mockRegistry({ core: [codeBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/code",
            attrs: { language: 42 },
            content: [{ type: "text", text: "x" }],
          },
        ],
      },
    });
    expect(stripBlockMarkers(html)).not.toContain("<code");
  });
});
