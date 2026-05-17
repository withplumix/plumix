import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
import { buttonBlock } from "./index.js";

describe("core/button", () => {
  test("renders as <a> when href is set", async () => {
    const registry = await mockRegistry({ core: [buttonBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/button",
            attrs: { href: "https://example.com", text: "Open" },
            content: [],
          },
        ],
      },
    });
    expect(html).toBe(
      '<a href="https://example.com" data-plumix-block="core/button">Open</a>',
    );
  });

  test.each(["primary", "secondary", "outline", "ghost"])(
    "exposes variant=%s as data-variant",
    async (variant) => {
      const registry = await mockRegistry({ core: [buttonBlock] });
      const html = renderBlock({
        registry,
        content: {
          type: "doc",
          content: [
            {
              type: "core/button",
              attrs: { href: "/x", text: "Go", variant },
              content: [],
            },
          ],
        },
      });
      expect(html).toContain(`data-variant="${variant}"`);
    },
  );

  test("ignores unknown variant values", async () => {
    const registry = await mockRegistry({ core: [buttonBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/button",
            attrs: { href: "/x", text: "Go", variant: "rainbow" },
            content: [],
          },
        ],
      },
    });
    expect(html).not.toContain("data-variant");
  });

  test.each(["sm", "md", "lg"])(
    "exposes size=%s as data-size",
    async (size) => {
      const registry = await mockRegistry({ core: [buttonBlock] });
      const html = renderBlock({
        registry,
        content: {
          type: "doc",
          content: [
            {
              type: "core/button",
              attrs: { href: "/x", text: "Go", size },
              content: [],
            },
          ],
        },
      });
      expect(html).toContain(`data-size="${size}"`);
    },
  );

  test("emits rel=noopener noreferrer when target=_blank", async () => {
    const registry = await mockRegistry({ core: [buttonBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/button",
            attrs: {
              href: "https://example.com",
              text: "External",
              target: "_blank",
            },
            content: [],
          },
        ],
      },
    });
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test("strips unsafe javascript: hrefs", async () => {
    const registry = await mockRegistry({ core: [buttonBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/button",
            attrs: { href: "javascript:alert(1)", text: "evil" },
            content: [],
          },
        ],
      },
    });
    expect(html).not.toContain("href=");
    expect(html).not.toContain("javascript:");
    expect(html).toContain(">evil</a>");
  });

  test("renders empty text as an empty anchor body", async () => {
    const registry = await mockRegistry({ core: [buttonBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/button",
            attrs: { href: "/x" },
            content: [],
          },
        ],
      },
    });
    expect(html).toBe('<a href="/x" data-plumix-block="core/button"></a>');
  });
});
