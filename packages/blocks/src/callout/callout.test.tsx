import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
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
    expect(html).toBe(
      '<aside role="note" data-plumix-block="core/callout" data-variant="info"></aside>',
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
      expect(html).toContain(`data-variant="${variant}"`);
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
    expect(html).toContain('data-variant="info"');
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
    expect(html).toContain('data-icon="lightbulb"');
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
    expect(html).not.toContain("data-icon");
  });
});
