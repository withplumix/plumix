import { describe, expect, test } from "vitest";

import { sanitizeHtml } from "./sanitize.js";

describe("sanitizeHtml — baseline allowlist", () => {
  test("returns empty string when input is empty", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  test("strips <script> tags entirely", () => {
    expect(sanitizeHtml("<p>hi</p><script>alert(1)</script>")).toBe(
      "<p>hi</p>",
    );
  });

  test("strips on* event-handler attributes", () => {
    expect(sanitizeHtml('<p onclick="alert(1)">hi</p>')).toBe("<p>hi</p>");
    expect(sanitizeHtml('<a href="/x" onmouseover="evil()">x</a>')).toBe(
      '<a href="/x">x</a>',
    );
  });

  test("strips javascript: and data: URLs from anchors", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe(
      "<a>x</a>",
    );
    expect(
      sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>'),
    ).toBe("<a>x</a>");
  });

  test("strips <iframe>, <object>, <embed>", () => {
    expect(sanitizeHtml('<iframe src="//evil"></iframe>hi')).toBe("hi");
    expect(sanitizeHtml('<object data="//evil"></object>hi')).toBe("hi");
    expect(sanitizeHtml('<embed src="//evil">hi')).toBe("hi");
  });

  test("preserves safe formatting tags", () => {
    const safe =
      '<p><strong>Bold</strong> and <em>italic</em> and <a href="https://example.com">link</a>.</p>';
    expect(sanitizeHtml(safe)).toBe(safe);
  });

  test("preserves heading + list structure", () => {
    const safe = "<h2>Title</h2><ul><li>one</li><li>two</li></ul>";
    expect(sanitizeHtml(safe)).toBe(safe);
  });

  test("strips <style> blocks (CSS-based attacks)", () => {
    expect(
      sanitizeHtml(
        "<style>body { background: url(javascript:alert(1)) }</style>hi",
      ),
    ).toBe("hi");
  });

  test("non-string input returns empty string", () => {
    expect(sanitizeHtml(undefined)).toBe("");
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(42)).toBe("");
  });

  // Regression tests for vectors that pass today only because of the
  // current allowlist config — without explicit tests, a future tweak
  // could silently regress one without anyone noticing.

  test("strips protocol-relative hrefs (`//evil` can't smuggle a scheme)", () => {
    expect(sanitizeHtml('<a href="//evil.example/x">x</a>')).toBe("<a>x</a>");
  });

  test.each([
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "javas&#99;ript:alert(1)",
    " javascript:alert(1)",
  ])("strips case- / whitespace- / entity-obfuscated %s", (href) => {
    const out = sanitizeHtml(`<a href="${href}">x</a>`);
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  test("preserves root-relative, fragment, and query-only hrefs", () => {
    expect(sanitizeHtml('<a href="/internal">x</a>')).toBe(
      '<a href="/internal">x</a>',
    );
    expect(sanitizeHtml('<a href="#section">x</a>')).toBe(
      '<a href="#section">x</a>',
    );
    expect(sanitizeHtml('<a href="?page=2">x</a>')).toBe(
      '<a href="?page=2">x</a>',
    );
  });

  test("strips target / rel from anchors (no reverse-tabnabbing surface)", () => {
    expect(
      sanitizeHtml('<a href="https://x.example" target="_blank">x</a>'),
    ).toBe('<a href="https://x.example">x</a>');
    expect(
      sanitizeHtml('<a href="https://x.example" rel="opener noreferrer">x</a>'),
    ).toBe('<a href="https://x.example">x</a>');
  });

  test("keeps all heading levels h1–h6", () => {
    expect(sanitizeHtml("<h1>title</h1>")).toBe("<h1>title</h1>");
    expect(sanitizeHtml("<h5>title</h5>")).toBe("<h5>title</h5>");
    expect(sanitizeHtml("<h6>title</h6>")).toBe("<h6>title</h6>");
  });

  test("strips <svg> / <math> containers used as XSS smuggling vectors", () => {
    expect(
      sanitizeHtml("<svg><script>alert(1)</script></svg>hi"),
    ).not.toContain("script");
    expect(
      sanitizeHtml(
        '<math><mglyph href="javascript:alert(1)">x</mglyph></math>hi',
      ),
    ).not.toContain("javascript");
  });

  test("strips data-* on <span> (no behavior-injection vector)", () => {
    expect(
      sanitizeHtml(
        '<span data-onclick="alert(1)" data-controller="evil">x</span>',
      ),
    ).toBe("<span>x</span>");
  });
});
