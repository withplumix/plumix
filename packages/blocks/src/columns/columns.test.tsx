import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
import { columnBlock } from "./column.js";
import { columnsBlock } from "./index.js";

describe("core/columns", () => {
  test("renders as a <div> wrapping column children", async () => {
    const registry = await mockRegistry({
      core: [columnsBlock, columnBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/columns", content: [] }],
      },
    });
    expect(html).toBe('<div data-plumix-block="core/columns"></div>');
  });

  test.each(["1:1", "1:2", "1:1:1", "2:1:2"])(
    "exposes ratio=%s as data-ratio",
    async (ratio) => {
      const registry = await mockRegistry({
        core: [columnsBlock, columnBlock],
      });
      const html = renderBlock({
        registry,
        content: {
          type: "doc",
          content: [{ type: "core/columns", attrs: { ratio }, content: [] }],
        },
      });
      expect(html).toBe(
        `<div data-plumix-block="core/columns" data-ratio="${ratio}"></div>`,
      );
    },
  );

  test("ignores malformed ratio values", async () => {
    const registry = await mockRegistry({
      core: [columnsBlock, columnBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          { type: "core/columns", attrs: { ratio: "lol" }, content: [] },
          { type: "core/columns", attrs: { ratio: 42 }, content: [] },
        ],
      },
    });
    expect(html).not.toContain("data-ratio");
  });
});

describe("core/column", () => {
  test("renders as a <div> wrapping inner blocks", async () => {
    const registry = await mockRegistry({
      core: [columnsBlock, columnBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/column", content: [] }],
      },
    });
    expect(html).toBe('<div data-plumix-block="core/column"></div>');
  });

  test.each([
    { width: "50%", expected: "50%" },
    { width: 33, expected: "33%" },
    { width: "1fr", expected: "1fr" },
  ])(
    "exposes width=$width as data-width=$expected",
    async ({ width, expected }) => {
      const registry = await mockRegistry({
        core: [columnsBlock, columnBlock],
      });
      const html = renderBlock({
        registry,
        content: {
          type: "doc",
          content: [{ type: "core/column", attrs: { width }, content: [] }],
        },
      });
      expect(html).toBe(
        `<div data-plumix-block="core/column" data-width="${expected}"></div>`,
      );
    },
  );

  test("omits data-width when absent", async () => {
    const registry = await mockRegistry({
      core: [columnsBlock, columnBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/column", content: [] }],
      },
    });
    expect(html).not.toContain("data-width");
  });
});
