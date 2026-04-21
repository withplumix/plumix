import { describe, expect, test } from "vitest";

import { renderTiptapContent } from "./tiptap.js";

function doc(...content: unknown[]) {
  return { type: "doc", content };
}

function p(...content: unknown[]) {
  return { type: "paragraph", content };
}

function t(text: string, marks?: readonly { type: string; attrs?: unknown }[]) {
  return marks ? { type: "text", text, marks } : { type: "text", text };
}

describe("renderTiptapContent — JSON input", () => {
  test("null and undefined inputs produce empty output", () => {
    expect(renderTiptapContent(null)).toBe("");
    expect(renderTiptapContent(undefined)).toBe("");
  });

  test("renders a doc → paragraph → text tree", () => {
    expect(renderTiptapContent(doc(p(t("Hello."))))).toBe("<p>Hello.</p>");
  });

  test("non-object / scalar inputs render empty (never throw)", () => {
    expect(renderTiptapContent(42)).toBe("");
    expect(renderTiptapContent("stray string")).toBe("");
    expect(renderTiptapContent(true)).toBe("");
  });

  test("unknown node types render empty — allowlist only", () => {
    expect(renderTiptapContent(doc({ type: "mystery" }))).toBe("");
  });

  test("script tags in text are escaped", () => {
    expect(renderTiptapContent(doc(p(t("<script>alert(1)</script>"))))).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  test("clamps heading levels to 1..6", () => {
    const h = (level: number) => ({
      type: "heading",
      attrs: { level },
      content: [t("x")],
    });
    expect(renderTiptapContent(h(1))).toBe("<h1>x</h1>");
    expect(renderTiptapContent(h(99))).toBe("<h6>x</h6>");
    expect(renderTiptapContent(h(-3))).toBe("<h1>x</h1>");
    expect(renderTiptapContent({ type: "heading", content: [t("x")] })).toBe(
      "<h2>x</h2>",
    );
  });

  test("applies marks inside-out so outer marks wrap inner ones", () => {
    expect(
      renderTiptapContent(
        doc(p(t("x", [{ type: "italic" }, { type: "bold" }]))),
      ),
    ).toBe("<p><em><strong>x</strong></em></p>");
  });

  test("link mark admits http/https/mailto/tel/relative, blocks javascript:", () => {
    const link = (href: string) =>
      renderTiptapContent(doc(p(t("x", [{ type: "link", attrs: { href } }]))));
    expect(link("https://example.com")).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer nofollow">x</a></p>',
    );
    expect(link("mailto:a@b.c")).toBe(
      '<p><a href="mailto:a@b.c" rel="noopener noreferrer nofollow">x</a></p>',
    );
    expect(link("/relative")).toBe(
      '<p><a href="/relative" rel="noopener noreferrer nofollow">x</a></p>',
    );
    expect(link("javascript:alert(1)")).toBe("<p>x</p>");
    expect(link("data:text/html,hi")).toBe("<p>x</p>");
  });

  test("link href is attr-escaped to prevent attribute breakout", () => {
    const rendered = renderTiptapContent(
      doc(p(t("x", [{ type: "link", attrs: { href: 'https://a/"evil' } }]))),
    );
    expect(rendered).toContain('href="https://a/&quot;evil"');
    expect(rendered).not.toContain('"evil"');
  });

  test("code block escapes inner text", () => {
    expect(
      renderTiptapContent({ type: "codeBlock", content: [t("<div>")] }),
    ).toBe("<pre><code>&lt;div&gt;</code></pre>");
  });

  test("lists, blockquote, hr, br render", () => {
    expect(
      renderTiptapContent({
        type: "bulletList",
        content: [{ type: "listItem", content: [p(t("a"))] }],
      }),
    ).toBe("<ul><li><p>a</p></li></ul>");
    expect(
      renderTiptapContent({
        type: "orderedList",
        content: [{ type: "listItem", content: [p(t("b"))] }],
      }),
    ).toBe("<ol><li><p>b</p></li></ol>");
    expect(
      renderTiptapContent({ type: "blockquote", content: [p(t("c"))] }),
    ).toBe("<blockquote><p>c</p></blockquote>");
    expect(renderTiptapContent({ type: "horizontalRule" })).toBe("<hr />");
    expect(renderTiptapContent({ type: "hardBreak" })).toBe("<br />");
  });
});
