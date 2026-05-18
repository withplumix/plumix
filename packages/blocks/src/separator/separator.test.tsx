import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock, stripBlockMarkers } from "../test/index.js";
import { separatorBlock } from "./index.js";

describe("core/separator", () => {
  test("renders as <hr> with the block-data marker", async () => {
    const registry = await mockRegistry({ core: [separatorBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/separator" }],
      },
    });
    expect(stripBlockMarkers(html)).toBe(
      '<hr data-variant="solid"/>',
    );
  });

  test.each(["solid", "dashed", "dotted", "wide"])(
    "exposes variant=%s as data-variant",
    async (variant) => {
      const registry = await mockRegistry({ core: [separatorBlock] });
      const html = renderBlock({
        registry,
        content: {
          type: "doc",
          content: [{ type: "core/separator", attrs: { variant } }],
        },
      });
      expect(stripBlockMarkers(html)).toContain(`data-variant="${variant}"`);
    },
  );

  test("falls back to data-variant=solid on unknown variants", async () => {
    const registry = await mockRegistry({ core: [separatorBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/separator", attrs: { variant: "rainbow" } }],
      },
    });
    expect(stripBlockMarkers(html)).toContain('data-variant="solid"');
  });
});
