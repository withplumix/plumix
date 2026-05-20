import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { codeBlockV2 } from "./v2.js";

describe("core/code v2", () => {
  test("renders a <pre> with the code text when no language is set", () => {
    const html = renderBlockSpecToHtml(codeBlockV2, {
      text: "const x = 1;",
    });

    expect(html).toBe(
      '<div data-plumix-block="core/code"><pre>const x = 1;</pre></div>',
    );
  });

  test("wraps the text in <code data-language> when a language is provided", () => {
    const html = renderBlockSpecToHtml(codeBlockV2, {
      text: "fn main() {}",
      language: "rust",
    });

    expect(html).toContain('data-language="rust"');
    expect(html).toContain('<code data-language="rust">fn main() {}</code>');
  });

  test("treats whitespace-only language as no language", () => {
    const html = renderBlockSpecToHtml(codeBlockV2, {
      text: "noop",
      language: "   ",
    });

    expect(html).not.toContain("<code");
    expect(html).not.toContain("data-language");
  });
});
