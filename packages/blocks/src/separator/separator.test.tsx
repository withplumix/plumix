import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
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
    expect(html).toBe(
      '<hr data-plumix-block="core/separator" data-variant="solid"/>',
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
      expect(html).toContain(`data-variant="${variant}"`);
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
    expect(html).toContain('data-variant="solid"');
  });
});
