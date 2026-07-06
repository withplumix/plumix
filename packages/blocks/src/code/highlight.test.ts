import { describe, expect, test } from "vitest";

import { CODE_THEME_CSS, highlightCode } from "./highlight.js";

describe("highlightCode", () => {
  test("wraps tokens in hljs spans for a supported language", () => {
    const html = highlightCode("const x = 1;", "javascript");
    expect(html).not.toBeNull();
    expect(html).toContain("hljs-");
  });

  test("escapes the source (no raw injection through code text)", () => {
    const html = highlightCode("<script>alert(1)</script>", "javascript");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;");
  });

  test("maps ids to their grammar (html→xml, toml→ini, jsx, tsx)", () => {
    for (const lang of ["html", "toml", "jsx", "tsx"]) {
      expect(highlightCode("x", lang)).not.toBeNull();
    }
  });

  test("returns null for a language no grammar covers", () => {
    expect(highlightCode("x", "cobol")).toBeNull();
  });

  test("theme CSS exposes overridable code token variables", () => {
    expect(CODE_THEME_CSS).toContain("--plumix-code-keyword");
    expect(CODE_THEME_CSS).toContain(".hljs");
  });
});
