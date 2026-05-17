import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
import { spacerBlock } from "./index.js";

describe("core/spacer", () => {
  test("renders a div with the block-data marker and default height", async () => {
    const registry = await mockRegistry({ core: [spacerBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/spacer" }],
      },
    });
    expect(html).toBe(
      '<div data-plumix-block="core/spacer" aria-hidden="true" style="height:24px"></div>',
    );
  });

  test("uses the explicit height attribute (number)", async () => {
    const registry = await mockRegistry({ core: [spacerBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/spacer", attrs: { height: 120 } }],
      },
    });
    expect(html).toContain('style="height:120px"');
  });

  test("clamps non-numeric height back to the default (24)", async () => {
    const registry = await mockRegistry({ core: [spacerBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/spacer", attrs: { height: "wat" } }],
      },
    });
    expect(html).toContain('style="height:24px"');
  });

  test("clamps negative heights back to the default", async () => {
    const registry = await mockRegistry({ core: [spacerBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/spacer", attrs: { height: -50 } }],
      },
    });
    expect(html).toContain('style="height:24px"');
  });
});
