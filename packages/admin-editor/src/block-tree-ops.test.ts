import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";

import {
  findBlock,
  flattenTree,
  moveBlock,
  projectMove,
} from "./block-tree-ops.js";

const ids = (tree: readonly BlockNode[]): string[] =>
  flattenTree(tree).map((n) => `${n.parentId ?? "-"}/${n.id}`);

const group = (id: string, children: readonly BlockNode[]): BlockNode => ({
  id,
  name: "core/group",
  attrs: { content: children },
});

const TREE: readonly BlockNode[] = [
  { id: "a", name: "core/heading" },
  {
    id: "g",
    name: "core/group",
    attrs: {
      content: [
        { id: "c1", name: "core/text" },
        {
          id: "c2",
          name: "core/group",
          attrs: { content: [{ id: "deep", name: "core/spacer" }] },
        },
      ],
    },
  },
];

describe("flattenTree", () => {
  test("walks the tree depth-first with depth, parent and slot capacity", () => {
    expect(flattenTree(TREE)).toEqual([
      {
        id: "a",
        name: "core/heading",
        depth: 0,
        parentId: null,
        hasSlot: false,
      },
      { id: "g", name: "core/group", depth: 0, parentId: null, hasSlot: true },
      { id: "c1", name: "core/text", depth: 1, parentId: "g", hasSlot: false },
      { id: "c2", name: "core/group", depth: 1, parentId: "g", hasSlot: true },
      {
        id: "deep",
        name: "core/spacer",
        depth: 2,
        parentId: "c2",
        hasSlot: false,
      },
    ]);
  });

  test("descends only the first slot (multi-slot blocks show one slot)", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "cols",
        name: "core/columns",
        attrs: {
          left: [{ id: "l", name: "x" }],
          right: [{ id: "r", name: "x" }],
        },
      },
    ];
    // Only the first slot's child surfaces, keeping the outline consistent
    // with what moveBlock can address.
    expect(flattenTree(tree).map((n) => n.id)).toEqual(["cols", "l"]);
  });

  test("returns an empty list for an empty tree", () => {
    expect(flattenTree([])).toEqual([]);
  });
});

describe("moveBlock", () => {
  test("reorders top-level siblings", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "x" },
      { id: "b", name: "x" },
      { id: "c", name: "x" },
    ];
    const moved = moveBlock(tree, "a", { parentId: null, index: 2 });
    expect(ids(moved)).toEqual(["-/b", "-/c", "-/a"]);
  });

  test("nests a top-level block into a group's slot", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "x" },
      group("g", [{ id: "c1", name: "x" }]),
    ];
    const moved = moveBlock(tree, "a", { parentId: "g", index: 0 });
    expect(ids(moved)).toEqual(["-/g", "g/a", "g/c1"]);
  });

  test("un-nests a child back to the top level", () => {
    const tree: readonly BlockNode[] = [group("g", [{ id: "c1", name: "x" }])];
    const moved = moveBlock(tree, "c1", { parentId: null, index: 0 });
    expect(ids(moved)).toEqual(["-/c1", "-/g"]);
  });

  test("refuses to move a block into itself", () => {
    const tree: readonly BlockNode[] = [group("g", [{ id: "c1", name: "x" }])];
    expect(moveBlock(tree, "g", { parentId: "g", index: 0 })).toBe(tree);
  });

  test("refuses to move a block into its own descendant", () => {
    const tree: readonly BlockNode[] = [
      group("g", [group("inner", [{ id: "c", name: "x" }])]),
    ];
    expect(moveBlock(tree, "g", { parentId: "inner", index: 0 })).toBe(tree);
  });

  test("is a no-op when the target parent has no slot to nest into", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "x" },
      { id: "leaf", name: "core/spacer" },
    ];
    expect(moveBlock(tree, "a", { parentId: "leaf", index: 0 })).toBe(tree);
  });

  test("is a no-op when the source is absent", () => {
    const tree: readonly BlockNode[] = [{ id: "a", name: "x" }];
    expect(moveBlock(tree, "missing", { parentId: null, index: 0 })).toBe(tree);
  });
});

describe("projectMove", () => {
  // a, b, then group g containing c — a typical mixed-depth outline.
  const FLAT = flattenTree([
    { id: "a", name: "x" },
    { id: "b", name: "x" },
    group("g", [{ id: "c", name: "x" }]),
  ]);
  const INDENT = 16;

  test("reorders to a new top-level position (no horizontal drag)", () => {
    expect(projectMove(FLAT, "a", "b", 0, INDENT)).toEqual({
      parentId: null,
      index: 1,
    });
  });

  test("nests under the preceding block when dragged right", () => {
    // Drag b down past g/c with one indent step → nests into g.
    expect(projectMove(FLAT, "b", "c", INDENT, INDENT)).toEqual({
      parentId: "g",
      index: 1,
    });
  });

  test("un-nests to the top level when dragged left", () => {
    // Drag c up to b's row with a left pull → leaves the group.
    expect(projectMove(FLAT, "c", "b", -INDENT, INDENT)).toEqual({
      parentId: null,
      index: 1,
    });
  });

  test("never nests under a slotless leaf (would silently no-op)", () => {
    // a (heading, no slot), leaf (no slot), x — drag x up onto leaf pulling
    // right. The projection must stay at the top level, not name leaf a parent.
    const flat = flattenTree([
      { id: "h", name: "core/heading" },
      { id: "leaf", name: "core/spacer" },
      { id: "x", name: "x" },
    ]);
    const target = projectMove(flat, "x", "leaf", INDENT, INDENT);
    expect(target).toEqual({ parentId: null, index: 1 });
  });

  test("returns null when the active block is unknown", () => {
    expect(projectMove(FLAT, "zzz", "b", 0, INDENT)).toBeNull();
  });
});

describe("findBlock", () => {
  test("finds a top-level block", () => {
    expect(findBlock(TREE, "g")?.name).toBe("core/group");
  });

  test("finds a deeply nested block", () => {
    expect(findBlock(TREE, "deep")?.id).toBe("deep");
  });

  test("returns undefined when absent", () => {
    expect(findBlock(TREE, "zzz")).toBeUndefined();
  });
});
