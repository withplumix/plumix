import { describe, expect, test } from "vitest";

import type { BlockNode, BlockRegistry } from "@plumix/core/blocks";
import { createBlockRegistry } from "@plumix/core/blocks";

import { inspectorView } from "./inspector-view.js";
import { layoutGate } from "./layout-gate.js";

const registry: BlockRegistry = createBlockRegistry([
  {
    name: "core/heading",
    view: () =>
      Promise.resolve({
        default: () => null,
      }),
    inputs: [
      { name: "text", type: "text", label: "Text", content: true },
      { name: "level", type: "select", label: "Level", options: [] },
    ],
  },
  {
    name: "core/spacer",
    view: () =>
      Promise.resolve({
        default: () => null,
      }),
  },
  {
    name: "core/group",
    view: () =>
      Promise.resolve({
        default: () => null,
      }),
    inputs: [
      { name: "content", type: "slot" },
      { name: "tag", type: "text", label: "Tag" },
    ],
  },
  {
    name: "core/latest-posts",
    view: () =>
      Promise.resolve({
        default: () => null,
        loaders: { posts: () => Promise.resolve([]) },
      }),
  },
  {
    name: "core/box",
    view: () =>
      Promise.resolve({
        default: () => null,
      }),
    inputs: [
      { name: "width", type: "text", label: "Width", styleProperty: "width" },
    ],
  },
  {
    name: "core/columns",
    view: () =>
      Promise.resolve({
        default: () => null,
      }),
    inputs: [{ name: "columns", type: "slot", allowedBlocks: ["core/column"] }],
  },
  {
    name: "core/table",
    view: () =>
      Promise.resolve({
        default: () => null,
      }),
    inputs: [{ name: "rows", type: "slot" }],
  },
  {
    name: "core/table-header-row",
    view: () =>
      Promise.resolve({
        default: () => null,
      }),
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
      new Set(),
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
      new Set(),
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
      new Set(),
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
      new Set(),
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
      new Set(),
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
      new Set(),
    );

    expect(view?.nothingToSet).toBe(false);
  });

  // The shell never loads a view module, so which blocks declare loaders is
  // what the canvas reported, not the definition.
  test.each([
    [
      "a block the canvas reported loaders for",
      "core/latest-posts",
      true,
      ["core/latest-posts"],
      true,
    ],
    [
      "a block the canvas hasn't reported loaders for",
      "core/latest-posts",
      true,
      [],
      false,
    ],
    [
      "a block without loaders",
      "core/heading",
      true,
      ["core/latest-posts"],
      false,
    ],
    [
      "a reported block with no refresh wired",
      "core/latest-posts",
      false,
      ["core/latest-posts"],
      false,
    ],
  ])(
    "whether the refresh control shows for %s",
    (_, name, canRefresh, loaderBlocks, shown) => {
      const view = inspectorView(
        registry,
        [{ id: "b1", name }],
        "b1",
        "large",
        canRefresh,
        new Set(loaderBlocks),
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
      new Set(),
    );

    expect(view?.showAddColumn).toBe(shown);
  });

  test("a writer without edit_layout gets only the content inputs", () => {
    const view = inspectorView(
      registry,
      [{ id: "h1", name: "core/heading", attrs: { text: "Hi", level: 2 } }],
      "h1",
      "large",
      false,
      new Set(),
      undefined,
      layoutGate(false),
    );

    expect(view?.inputs.map(({ input }) => input.name)).toEqual(["text"]);
  });

  test.each([
    ["Add column", [{ id: "b1", name: "core/columns" }], "b1"],
    ["the table controls", tableTree, "c0"],
  ])(
    "a writer without edit_layout gets no %s",
    (_, tree: readonly BlockNode[], id) => {
      const view = inspectorView(
        registry,
        tree,
        id,
        "large",
        false,
        new Set(),
        undefined,
        layoutGate(false),
      );

      expect([view?.showAddColumn, view?.tableId]).toEqual([false, null]);
    },
  );

  test("a selected table cell keeps its table's controls in reach", () => {
    const view = inspectorView(
      registry,
      tableTree,
      "c0",
      "large",
      false,
      new Set(),
    );

    expect(view?.tableId).toBe("tbl");
  });

  test("a block outside a table has no table controls", () => {
    const view = inspectorView(
      registry,
      [{ id: "h1", name: "core/heading" }],
      "h1",
      "large",
      false,
      new Set(),
    );

    expect(view?.tableId).toBeNull();
  });

  test("marks a block this site doesn't register, with nothing to set", () => {
    const view = inspectorView(
      registry,
      [{ id: "o", name: "acme/gone", attrs: { title: "Kept" } }],
      "o",
      "large",
      true,
      new Set(),
    );

    expect(view).toMatchObject({
      unregistered: true,
      inputs: [],
      nothingToSet: false,
    });
  });

  test("marks a block the theme no longer allows, keeping its controls", () => {
    const tree = [{ id: "o", name: "core/group", attrs: {} }];

    expect(
      inspectorView(
        registry,
        tree,
        "o",
        "large",
        true,
        new Set(),
        new Set(["x/other"]),
      ),
    ).toMatchObject({ unregistered: false, notAllowed: true });
    expect(
      inspectorView(
        registry,
        tree,
        "o",
        "large",
        true,
        new Set(),
        new Set(["core/group"]),
      ),
    ).toMatchObject({ notAllowed: false });
    expect(
      inspectorView(registry, tree, "o", "large", true, new Set()),
    ).toMatchObject({
      notAllowed: false,
    });
  });
});
