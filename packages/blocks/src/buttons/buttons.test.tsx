import { describe, expect, test } from "vitest";

import { buttonBlock } from "../button/index.js";
import { mockRegistry, renderBlock, stripBlockMarkers } from "../test/index.js";
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
    expect(stripBlockMarkers(html)).toBe('<div></div>');
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
      expect(stripBlockMarkers(html)).toContain(`data-align="${align}"`);
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
    expect(stripBlockMarkers(html)).not.toContain("data-align");
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
    expect(stripBlockMarkers(html)).toContain('data-gap="12px"');
    expect(stripBlockMarkers(html)).toContain('data-gap="1rem"');
  });

  test("declares align (select) + gap (text) attributes for the Inspector", () => {
    expect(buttonsBlock.attributes?.align).toMatchObject({
      type: "select",
      default: "start",
    });
    expect(buttonsBlock.attributes?.gap).toMatchObject({ type: "text" });
  });

  test("declares supports for color/spacing/customClassName/anchor", () => {
    expect(buttonsBlock.supports).toEqual({
      color: { background: true },
      spacing: { padding: true, margin: true },
      anchor: true,
      customClassName: true,
    });
  });
});
