import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock, stripBlockMarkers } from "../test/index.js";
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
    expect(stripBlockMarkers(html)).toBe(
      '<a href="https://example.com">Open</a>',
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
      expect(stripBlockMarkers(html)).toContain(`data-variant="${variant}"`);
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
    expect(stripBlockMarkers(html)).not.toContain("data-variant");
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
      expect(stripBlockMarkers(html)).toContain(`data-size="${size}"`);
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
    expect(stripBlockMarkers(html)).toContain('target="_blank"');
    expect(stripBlockMarkers(html)).toContain('rel="noopener noreferrer"');
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
    expect(stripBlockMarkers(html)).not.toContain("href=");
    expect(stripBlockMarkers(html)).not.toContain("javascript:");
    expect(stripBlockMarkers(html)).toContain(">evil</a>");
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
    expect(stripBlockMarkers(html)).toBe('<a href="/x"></a>');
  });

  test("declares the text/href/variant/size/target attribute schema for the Inspector", () => {
    expect(buttonBlock.attributes?.text).toMatchObject({ type: "text" });
    expect(buttonBlock.attributes?.href).toMatchObject({ type: "url" });
    expect(buttonBlock.attributes?.variant).toMatchObject({
      type: "select",
      default: "primary",
    });
    expect(buttonBlock.attributes?.size).toMatchObject({
      type: "select",
      default: "md",
    });
  });

  test("declares supports for color/spacing/border/customClassName/anchor", () => {
    expect(buttonBlock.supports).toEqual({
      color: { background: true, text: true },
      spacing: { padding: true, margin: true },
      border: { radius: true },
      anchor: true,
      customClassName: true,
    });
  });
});
