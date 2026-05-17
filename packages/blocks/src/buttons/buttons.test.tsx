import { describe, expect, test } from "vitest";

import { buttonBlock } from "../button/index.js";
import { mockRegistry, renderBlock } from "../test/index.js";
import { buttonsBlock } from "./index.js";

describe("core/buttons", () => {
  test("renders as a <div> wrapping button children", async () => {
    const registry = await mockRegistry({
      core: [buttonsBlock, buttonBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/buttons", content: [] }],
      },
    });
    expect(html).toBe('<div data-plumix-block="core/buttons"></div>');
  });

  test.each(["start", "center", "end", "between"])(
    "exposes align=%s as data-align",
    async (align) => {
      const registry = await mockRegistry({
        core: [buttonsBlock, buttonBlock],
      });
      const html = renderBlock({
        registry,
        content: {
          type: "doc",
          content: [{ type: "core/buttons", attrs: { align }, content: [] }],
        },
      });
      expect(html).toContain(`data-align="${align}"`);
    },
  );

  test("rejects unknown align values", async () => {
    const registry = await mockRegistry({
      core: [buttonsBlock, buttonBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          { type: "core/buttons", attrs: { align: "diagonal" }, content: [] },
        ],
      },
    });
    expect(html).not.toContain("data-align");
  });

  test("normalises numeric gap to a px string", async () => {
    const registry = await mockRegistry({
      core: [buttonsBlock, buttonBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          { type: "core/buttons", attrs: { gap: 12 }, content: [] },
          { type: "core/buttons", attrs: { gap: "1rem" }, content: [] },
        ],
      },
    });
    expect(html).toContain('data-gap="12px"');
    expect(html).toContain('data-gap="1rem"');
  });
});
