import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import { codeBlock } from "./index.js";

describe("core/code", () => {
  test("renders a bare <pre> with the code text when no language is set", () => {
    const html = renderBlockSpecToHtml(codeBlock, {
      text: "const x = 1;",
    });

    // selfSeam: the <pre> is the block, not wrapped in a div.
    expect(html).toBe("<pre>const x = 1;</pre>");
  });

  test("seeds theme-overridable default styles onto the <pre>", () => {
    const html = renderBlockTreeToHtml(
      [codeBlock],
      [
        {
          id: "c1",
          name: "core/code",
          attrs: { text: "x" },
          style: codeBlock.defaultStyles,
        },
      ],
    );

    // The scoped style class lands on the <pre> (selfSeam), and the box styles
    // use var(--plumix-code-*, fallback) a theme can override.
    expect(html).toContain('<pre class="plumix-block-c1"');
    expect(html).toContain("--plumix-code-padding");
    // The comma-separated font stack survives the CSS sanitizer intact.
    expect(html).toContain("SFMono-Regular, Menlo, monospace");
  });

  test("syntax-highlights the code for a supported language", () => {
    const html = renderBlockSpecToHtml(codeBlock, {
      text: "fn main() {}",
      language: "rust",
    });

    expect(html).toContain('data-language="rust"');
    // highlight.js wraps tokens in hljs spans; the theme rides along as vars.
    expect(html).toContain('class="hljs"');
    expect(html).toContain("hljs-");
    expect(html).toContain("--plumix-code-");
  });

  test("falls back to plain <code> for a language no grammar covers", () => {
    const html = renderBlockSpecToHtml(codeBlock, {
      text: "IDENTIFICATION DIVISION.",
      language: "cobol",
    });

    // Unknown language: semantic attribute kept, no highlight markup.
    expect(html).toContain(
      '<code data-language="cobol">IDENTIFICATION DIVISION.</code>',
    );
    expect(html).not.toContain('class="hljs"');
  });

  test("treats whitespace-only language as no language", () => {
    const html = renderBlockSpecToHtml(codeBlock, {
      text: "noop",
      language: "   ",
    });

    expect(html).not.toContain("<code");
    expect(html).not.toContain("data-language");
  });

  test("normalizes an alias to its canonical id at render", () => {
    const html = renderBlockSpecToHtml(codeBlock, {
      text: "const x = 1;",
      language: "ts",
    });

    expect(html).toContain('data-language="typescript"');
  });

  test("a freshly inserted block carries visible placeholder code", () => {
    const html = renderBlockSpecToHtml(codeBlock, codeBlock.defaults);

    expect(html).toContain("Your code here");
  });

  test("exposes the language input as a combobox suggesting common languages", () => {
    const languageInput = codeBlock.inputs?.find((i) => i.name === "language");
    // Combobox (free text + datalist), not select — a select would drop
    // stored values outside the suggestion list.
    expect(languageInput?.type).toBe("combobox");
    const values = languageInput?.options?.map((o) => o.value);
    expect(values).toContain("typescript");
    expect(values).toContain("rust");
  });
});
