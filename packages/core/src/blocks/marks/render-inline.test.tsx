import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { renderInline, renderInlineAll } from "./render-inline.js";

function htmlOf(doc: unknown): string {
  return renderToStaticMarkup(<>{renderInline(doc)}</>);
}

function htmlOfAll(doc: unknown): string {
  return renderToStaticMarkup(<>{renderInlineAll(doc)}</>);
}

describe("renderInline (single-paragraph)", () => {
  test("returns empty for an empty doc", () => {
    expect(htmlOf({ type: "doc", content: [] })).toBe("");
    expect(htmlOf(undefined)).toBe("");
  });

  test("renders unmarked text as plain string content", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
      ],
    };
    expect(htmlOf(doc)).toBe("Hello world");
  });

  test("wraps text in <strong> when the bold mark is applied", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hi " },
            { type: "text", text: "world", marks: [{ type: "bold" }] },
          ],
        },
      ],
    };
    expect(htmlOf(doc)).toBe("Hi <strong>world</strong>");
  });

  test("maps each known simple mark to its semantic HTML tag", () => {
    const cases: readonly [string, string][] = [
      ["italic", "em"],
      ["strike", "s"],
      ["code", "code"],
      ["underline", "u"],
      ["subscript", "sub"],
      ["superscript", "sup"],
      ["highlight", "mark"],
      ["kbd", "kbd"],
      ["cite", "cite"],
      ["small", "small"],
    ];
    for (const [mark, tag] of cases) {
      const doc = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: mark }] }],
          },
        ],
      };
      expect(htmlOf(doc)).toBe(`<${tag}>x</${tag}>`);
    }
  });

  test("renders link marks with sanitized href + locked rel", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "go",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com", target: "_blank" },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(htmlOf(doc)).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">go</a>',
    );
  });

  test("drops link wrappers when href is unsafe (defense in depth)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    };
    expect(htmlOf(doc)).toBe("x");
  });

  test("renders abbr marks with the title attribute", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "WCAG",
              marks: [
                {
                  type: "abbr",
                  attrs: { title: "Web Content Accessibility Guidelines" },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(htmlOf(doc)).toBe(
      '<abbr title="Web Content Accessibility Guidelines">WCAG</abbr>',
    );
  });

  test("nests marks right-to-left so the outermost element is the first mark", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "bold" }, { type: "italic" }],
            },
          ],
        },
      ],
    };
    expect(htmlOf(doc)).toBe("<strong><em>x</em></strong>");
  });
});

describe("renderInlineAll (multi-paragraph)", () => {
  test("emits one <p> per paragraph child", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "first" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "second ", marks: [{ type: "bold" }] },
          ],
        },
      ],
    };
    expect(htmlOfAll(doc)).toBe("<p>first</p><p><strong>second </strong></p>");
  });
});
