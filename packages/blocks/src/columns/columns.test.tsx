import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock, stripBlockMarkers } from "../test/index.js";
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
    expect(stripBlockMarkers(html)).toBe('<div></div>');
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
      expect(stripBlockMarkers(html)).toBe(
        `<div data-ratio="${ratio}"></div>`,
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
    expect(stripBlockMarkers(html)).not.toContain("data-ratio");
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
    expect(stripBlockMarkers(html)).toBe('<div></div>');
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
      expect(stripBlockMarkers(html)).toBe(
        `<div data-width="${expected}"></div>`,
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
    expect(stripBlockMarkers(html)).not.toContain("data-width");
  });

  test("columnBlock declares a `width` text attribute the Inspector renders", () => {
    expect(columnBlock.attributes?.width).toMatchObject({ type: "text" });
  });
});

describe("core/columns variations", () => {
  test("declares 50/50, 33/67, 25/50/25, and 25/25/25/25 as separate slash-menu entries", () => {
    const slugs = (columnsBlock.variations ?? []).map((v) => v.name);
    expect(slugs).toEqual(
      expect.arrayContaining(["50-50", "33-67", "25-50-25", "25-25-25-25"]),
    );
  });

  test("each variation presets the parent ratio and templates the right number of empty column children", () => {
    const fifty = columnsBlock.variations?.find((v) => v.name === "50-50");
    expect(fifty?.attributes).toEqual({ ratio: "1:1" });
    expect(fifty?.innerBlocks).toHaveLength(2);
    expect(fifty?.innerBlocks?.[0]?.name).toBe("core/column");

    const threeUneven = columnsBlock.variations?.find(
      (v) => v.name === "25-50-25",
    );
    expect(threeUneven?.attributes).toEqual({ ratio: "1:2:1" });
    expect(threeUneven?.innerBlocks).toHaveLength(3);
  });
});

describe("core/columns attribute schema", () => {
  test("columnsBlock declares a `ratio` select attribute with canonical options", () => {
    expect(columnsBlock.attributes?.ratio).toMatchObject({
      type: "select",
      default: "1:1",
    });
    const options = (columnsBlock.attributes?.ratio?.options ?? []) as {
      value: string;
    }[];
    expect(options.map((o) => o.value)).toEqual(
      expect.arrayContaining(["1:1", "1:2", "2:1", "1:1:1", "1:2:1"]),
    );
  });
});
