import { describe, expect, test } from "vitest";

import { coreBlocks } from "../core-blocks.js";
import { mockRegistry, renderBlock } from "../test/index.js";
import { headingBlock } from "./index.js";

describe("core/heading", () => {
  test("is shipped in coreBlocks alongside core/paragraph", () => {
    const names = coreBlocks.map((b) => b.name);
    expect(names).toContain("core/heading");
  });

  test("renders <h2> for the default level", async () => {
    const registry = await mockRegistry({ core: [headingBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/heading",
            content: [{ type: "text", text: "Title" }],
          },
        ],
      },
    });
    expect(html).toBe("<h2>Title</h2>");
  });

  test.each([1, 2, 3, 4, 5, 6])("respects level=%i as <h%i>", async (level) => {
    const registry = await mockRegistry({ core: [headingBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/heading",
            attrs: { level },
            content: [{ type: "text", text: "Title" }],
          },
        ],
      },
    });
    expect(html).toBe(`<h${level}>Title</h${level}>`);
  });

  test.each([
    { level: 0, expected: 1 },
    { level: -3, expected: 1 },
    { level: 7, expected: 6 },
    { level: 99, expected: 6 },
    { level: 2.7, expected: 2 },
  ])("clamps level=$level to <h$expected>", async ({ level, expected }) => {
    const registry = await mockRegistry({ core: [headingBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/heading",
            attrs: { level },
            content: [{ type: "text", text: "T" }],
          },
        ],
      },
    });
    expect(html).toBe(`<h${expected}>T</h${expected}>`);
  });

  test('legacy `type: "heading"` content renders identically', async () => {
    const registry = await mockRegistry({ core: [headingBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "Legacy" }],
          },
        ],
      },
    });
    expect(html).toBe("<h3>Legacy</h3>");
  });

  test("falls back to <h2> when level is not a number", async () => {
    const registry = await mockRegistry({ core: [headingBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/heading",
            attrs: { level: "two" },
            content: [{ type: "text", text: "T" }],
          },
        ],
      },
    });
    expect(html).toBe("<h2>T</h2>");
  });
});
