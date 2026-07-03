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

  test("wraps the text in <code data-language> when a language is provided", () => {
    const html = renderBlockSpecToHtml(codeBlock, {
      text: "fn main() {}",
      language: "rust",
    });

    expect(html).toContain('data-language="rust"');
    expect(html).toContain('<code data-language="rust">fn main() {}</code>');
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
