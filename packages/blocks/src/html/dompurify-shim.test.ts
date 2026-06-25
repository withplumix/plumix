// The browser editor / islands bundle swaps `sanitize-html` for this
// DOMPurify-backed shim (via this package's `browser` field). It MUST enforce
// the same security guarantees as the server engine for the same allowlist —
// these tests assert security *properties* rather than exact serialization,
// since DOMPurify and sanitize-html emit byte-different (but security-
// equivalent) markup.
import { describe, expect, test } from "vitest";

import sanitize from "./dompurify-shim.js";
import { BASELINE_HTML_ALLOWLIST } from "./sanitize.js";

// Mirror how `sanitizeHtml` normalizes the allowlist into the option shape the
// engine (sanitize-html / this shim) consumes.
const opts = {
  allowedTags: [...BASELINE_HTML_ALLOWLIST.allowedTags],
  allowedAttributes: Object.fromEntries(
    Object.entries(BASELINE_HTML_ALLOWLIST.allowedAttributes).map(
      ([tag, attrs]) => [tag, [...attrs]],
    ),
  ),
  allowedSchemes: [...(BASELINE_HTML_ALLOWLIST.allowedSchemes ?? [])],
  allowProtocolRelative: BASELINE_HTML_ALLOWLIST.allowProtocolRelative ?? false,
};

function run(raw: unknown): string {
  return sanitize(raw, opts);
}

function parse(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("dompurify-shim — baseline allowlist parity", () => {
  test("strips <script> tags AND their content", () => {
    const out = run("<p>hi</p><script>alert(1)</script>");
    expect(out).not.toMatch(/script/i);
    expect(out).not.toContain("alert(1)");
    expect(parse(out).querySelector("p")?.textContent).toBe("hi");
  });

  test("strips on* event-handler attributes", () => {
    const a = parse(run('<a href="/x" onmouseover="evil()">x</a>'));
    expect(a.querySelector("a")?.getAttribute("onmouseover")).toBeNull();
    expect(a.querySelector("a")?.getAttribute("href")).toBe("/x");
    const p = parse(run('<p onclick="alert(1)">hi</p>'));
    expect(p.querySelector("p")?.getAttribute("onclick")).toBeNull();
  });

  test("strips javascript: and data: hrefs", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
    ]) {
      const a = parse(run(`<a href="${href}">x</a>`)).querySelector("a");
      expect(a).not.toBeNull();
      expect(a?.getAttribute("href")).toBeNull();
    }
  });

  test("strips case- / whitespace- / entity-obfuscated javascript: schemes", () => {
    for (const href of [
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "javas&#99;ript:alert(1)",
      " javascript:alert(1)",
    ]) {
      const out = run(`<a href="${href}">x</a>`);
      expect(out.toLowerCase()).not.toContain("javascript:");
    }
  });

  test("strips protocol-relative hrefs (allowProtocolRelative: false)", () => {
    const a = parse(run('<a href="//evil.example/x">x</a>')).querySelector("a");
    expect(a?.getAttribute("href")).toBeNull();
  });

  test("preserves root-relative, fragment, and query-only hrefs", () => {
    for (const href of ["/internal", "#section", "?page=2"]) {
      const a = parse(run(`<a href="${href}">x</a>`)).querySelector("a");
      expect(a?.getAttribute("href")).toBe(href);
    }
  });

  test("strips target / rel from anchors", () => {
    const a = parse(
      run('<a href="https://x.example" target="_blank" rel="opener">x</a>'),
    ).querySelector("a");
    expect(a?.getAttribute("target")).toBeNull();
    expect(a?.getAttribute("rel")).toBeNull();
    expect(a?.getAttribute("href")).toBe("https://x.example");
  });

  test("enforces per-tag attributes (href only on <a>, not on <span>)", () => {
    const span = parse(
      run('<span href="https://evil.example">x</span>'),
    ).querySelector("span");
    expect(span?.getAttribute("href")).toBeNull();
  });

  test("strips data-* on <span>", () => {
    const span = parse(
      run('<span data-onclick="alert(1)" data-controller="evil">x</span>'),
    ).querySelector("span");
    expect(span?.attributes.length).toBe(0);
  });

  test("strips <iframe>, <object>, <embed>, <svg>, <math>", () => {
    for (const html of [
      '<iframe src="//evil"></iframe>hi',
      '<object data="//evil"></object>hi',
      '<embed src="//evil">hi',
      "<svg><script>alert(1)</script></svg>hi",
      '<math><mglyph href="javascript:alert(1)">x</mglyph></math>hi',
    ]) {
      const out = run(html);
      expect(out).not.toMatch(/iframe|object|embed|svg|math|script/i);
      expect(out.toLowerCase()).not.toContain("javascript");
    }
  });

  test("strips non-allowlisted heading levels to text", () => {
    for (const tag of ["h5", "h6"]) {
      const out = run(`<${tag}>title</${tag}>`);
      expect(out).not.toContain(`<${tag}`);
      expect(parse(out).textContent).toBe("title");
    }
  });

  test("strips <style> blocks and their content", () => {
    const out = run(
      "<style>body { background: url(javascript:alert(1)) }</style>hi",
    );
    expect(out).not.toMatch(/style/i);
    expect(out).not.toContain("javascript");
  });

  test("preserves safe formatting, heading, and list structure", () => {
    const safe = parse(
      run(
        '<h2>Title</h2><p><strong>Bold</strong> <em>i</em> <a href="https://example.com">l</a></p><ul><li>one</li></ul>',
      ),
    );
    expect(safe.querySelector("h2")?.textContent).toBe("Title");
    expect(safe.querySelector("strong")?.textContent).toBe("Bold");
    expect(safe.querySelector("em")?.textContent).toBe("i");
    expect(safe.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com",
    );
    expect(safe.querySelector("li")?.textContent).toBe("one");
  });

  test("non-string and empty input returns empty string", () => {
    expect(run(undefined)).toBe("");
    expect(run(null)).toBe("");
    expect(run(42)).toBe("");
    expect(run("")).toBe("");
  });
});
