import { describe, expect, test } from "vitest";

import type { BlockNode, BlockRegistry } from "@plumix/core/blocks";
import { createBlockRegistry } from "@plumix/core/blocks";

import { inspectorView } from "./inspector-view.js";

const registry: BlockRegistry = createBlockRegistry([
  {
    name: "core/heading",
    render: () => null,
    inputs: [
      { name: "text", type: "text", label: "Text" },
      { name: "level", type: "select", label: "Level", options: [] },
    ],
  },
  { name: "core/spacer", render: () => null },
  {
    name: "core/group",
    render: () => null,
    inputs: [
      { name: "content", type: "slot" },
      { name: "tag", type: "text", label: "Tag" },
    ],
  },
  {
    name: "core/latest-posts",
    render: () => null,
    loaders: { posts: () => Promise.resolve([]) },
  },
  {
    name: "core/box",
    render: () => null,
    inputs: [
      { name: "width", type: "text", label: "Width", styleProperty: "width" },
    ],
  },
  {
    name: "core/columns",
    render: () => null,
    inputs: [{ name: "columns", type: "slot", allowedBlocks: ["core/column"] }],
  },
  {
    name: "core/table",
    render: () => null,
    inputs: [{ name: "rows", type: "slot" }],
  },
  {
    name: "core/table-header-row",
    render: () => null,
    inputs: [{ name: "cells", type: "slot" }],
  },
]);

const tableTree: readonly BlockNode[] = [
  {
    id: "tbl",
    name: "core/table",
    attrs: {
      rows: [
        {
          id: "r0",
          name: "core/table-header-row",
          attrs: { cells: [{ id: "c0", name: "core/table-header-cell" }] },
        },
      ],
    },
  },
];

describe("inspectorView", () => {
  test("is null when nothing is selected", () => {
    const view = inspectorView(
      registry,
      [{ id: "h1", name: "core/heading" }],
      null,
      "large",
      false,
    );

    expect(view).toBeNull();
  });

  test("lists the active block's inputs with their attr values", () => {
    const view = inspectorView(
      registry,
      [{ id: "h1", name: "core/heading", attrs: { text: "Hi", level: 2 } }],
      "h1",
      "large",
      false,
    );

    expect(view?.inputs.map(({ input, value }) => [input.name, value])).toEqual(
      [
        ["text", "Hi"],
        ["level", 2],
      ],
    );
  });

  test("skips slot inputs, which as a control would overwrite the children", () => {
    const view = inspectorView(
      registry,
      [
        {
          id: "g1",
          name: "core/group",
          attrs: { content: [], tag: "section" },
        },
      ],
      "g1",
      "large",
      false,
    );

    expect(view?.inputs.map(({ input }) => input.name)).toEqual(["tag"]);
  });

  test("a styleProperty input reads the active device's node.style", () => {
    const view = inspectorView(
      registry,
      [
        {
          id: "b1",
          name: "core/box",
          attrs: { width: "ignored" },
          style: { large: { width: "800px" }, small: { width: "100%" } },
        },
      ],
      "b1",
      "small",
      false,
    );

    expect(view?.inputs[0]?.value).toBe("100%");
  });

  test("a block with nothing to set says so", () => {
    const view = inspectorView(
      registry,
      [{ id: "s1", name: "core/spacer" }],
      "s1",
      "large",
      false,
    );

    expect(view?.nothingToSet).toBe(true);
  });

  test("a block with inputs has settings", () => {
    const view = inspectorView(
      registry,
      [{ id: "h1", name: "core/heading" }],
      "h1",
      "large",
      false,
    );

    expect(view?.nothingToSet).toBe(false);
  });

  test.each([
    [
      "a loader-backed block with a refresh wired",
      "core/latest-posts",
      true,
      true,
    ],
    ["a block without loaders", "core/heading", true, false],
    [
      "a loader-backed block with no refresh wired",
      "core/latest-posts",
      false,
      false,
    ],
  ])(
    "whether the refresh control shows for %s",
    (_, name, canRefresh, shown) => {
      const view = inspectorView(
        registry,
        [{ id: "b1", name }],
        "b1",
        "large",
        canRefresh,
      );

      expect(view?.showRefresh).toBe(shown);
    },
  );

  test.each([
    ["core/columns", true],
    ["core/heading", false],
  ])("whether Add column shows for %s", (name, shown) => {
    const view = inspectorView(
      registry,
      [{ id: "b1", name }],
      "b1",
      "large",
      false,
    );

    expect(view?.showAddColumn).toBe(shown);
  });

  test("a selected table cell keeps its table's controls in reach", () => {
    const view = inspectorView(registry, tableTree, "c0", "large", false);

    expect(view?.tableId).toBe("tbl");
  });

  test("a block outside a table has no table controls", () => {
    const view = inspectorView(
      registry,
      [{ id: "h1", name: "core/heading" }],
      "h1",
      "large",
      false,
    );

    expect(view?.tableId).toBeNull();
  });
});
