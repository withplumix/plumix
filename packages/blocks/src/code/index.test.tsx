import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { codeBlock } from "./index.js";

describe("core/code", () => {
  test("renders a <pre> with the code text when no language is set", () => {
    const html = renderBlockSpecToHtml(codeBlock, {
      text: "const x = 1;",
    });

    expect(html).toBe("<div><pre>const x = 1;</pre></div>");
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
