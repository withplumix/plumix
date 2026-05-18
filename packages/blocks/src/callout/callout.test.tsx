import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock, stripBlockMarkers } from "../test/index.js";
import { calloutBlock } from "./index.js";

describe("core/callout", () => {
  test('renders as <aside role="note"> wrapping children', async () => {
    const registry = await mockRegistry({ core: [calloutBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/callout", content: [] }],
      },
    });
    expect(stripBlockMarkers(html)).toBe(
      '<aside role="note" data-variant="info"></aside>',
    );
  });

  test.each(["info", "warn", "error", "success", "note"])(
    "exposes variant=%s as data-variant",
    async (variant) => {
      const registry = await mockRegistry({ core: [calloutBlock] });
      const html = renderBlock({
        registry,
        content: {
          type: "doc",
          content: [{ type: "core/callout", attrs: { variant }, content: [] }],
        },
      });
      expect(stripBlockMarkers(html)).toContain(`data-variant="${variant}"`);
    },
  );

  test("falls back to data-variant=info on unknown variants", async () => {
    const registry = await mockRegistry({ core: [calloutBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/callout",
            attrs: { variant: "rainbow" },
            content: [],
          },
        ],
      },
    });
    expect(stripBlockMarkers(html)).toContain('data-variant="info"');
  });

  test("exposes icon attr as data-icon", async () => {
    const registry = await mockRegistry({ core: [calloutBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/callout",
            attrs: { icon: "lightbulb" },
            content: [],
          },
        ],
      },
    });
    expect(stripBlockMarkers(html)).toContain('data-icon="lightbulb"');
  });

  test("omits data-icon when icon attr is absent or non-string", async () => {
    const registry = await mockRegistry({ core: [calloutBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          { type: "core/callout", content: [] },
          { type: "core/callout", attrs: { icon: 42 }, content: [] },
        ],
      },
    });
    expect(stripBlockMarkers(html)).not.toContain("data-icon");
  });

  test("declares variant (select) + icon (text) attributes for the Inspector", () => {
    expect(calloutBlock.attributes?.variant).toMatchObject({
      type: "select",
      default: "info",
    });
    const options = (calloutBlock.attributes?.variant?.options ?? []) as {
      value: string;
    }[];
    expect(options.map((o) => o.value)).toEqual([
      "info",
      "warn",
      "error",
      "success",
      "note",
    ]);
    expect(calloutBlock.attributes?.icon).toMatchObject({ type: "text" });
  });

  test("declares supports for color/spacing/border/anchor/customClassName", () => {
    expect(calloutBlock.supports).toEqual({
      color: { background: true, text: true },
      spacing: { padding: true, margin: true },
      border: { radius: true },
      anchor: true,
      customClassName: true,
    });
  });
});
