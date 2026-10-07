import { describe, expect, test } from "vitest";

import type { BlockNode, JsonValue } from "@plumix/core/blocks";

import { treeBlocks } from "../test/tree-blocks.js";
import {
  appendTableColumn,
  appendTableRow,
  canGroupSelection,
  canUngroupBlock,
  collectBlocks,
  duplicateBlock,
  enclosingTableId,
  findBlock,
  findParentId,
  flattenTree,
  groupBlocks,
  insertBlockAt,
  moveBlock,
  moveBlockBy,
  pasteBlocks,
  projectMove,
  removeBlocks,
  removeTableColumn,
  removeTableRow,
  selectionRoots,
  ungroupBlock,
} from "./block-tree-ops.js";

const columns = (
  left: readonly BlockNode[],
  right: readonly BlockNode[],
): BlockNode => ({
  id: "cols",
  name: "core/columns",
  attrs: { left, right },
});

const ids = (tree: readonly BlockNode[]): string[] =>
  flattenTree(tree, treeBlocks).map((n) => `${n.parentId ?? "-"}/${n.id}`);

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
    expect(flattenTree(TREE, treeBlocks)).toEqual([
      {
        id: "a",
        name: "core/heading",
        depth: 0,
        parentId: null,
        slotKey: null,
        hasSlot: false,
      },
      {
        id: "g",
        name: "core/group",
        depth: 0,
        parentId: null,
        slotKey: null,
        hasSlot: true,
      },
      {
        id: "c1",
        name: "core/text",
        depth: 1,
        parentId: "g",
        slotKey: "content",
        hasSlot: false,
      },
      {
        id: "c2",
        name: "core/group",
        depth: 1,
        parentId: "g",
        slotKey: "content",
        hasSlot: true,
      },
      {
        id: "deep",
        name: "core/spacer",
        depth: 2,
        parentId: "c2",
        slotKey: "content",
        hasSlot: false,
      },
    ]);
  });

  test("descends every slot in declaration order, tagging each child's slot", () => {
    const tree: readonly BlockNode[] = [
      columns(
        [
          { id: "l1", name: "x" },
          { id: "l2", name: "x" },
        ],
        [
          { id: "r1", name: "x" },
          { id: "r2", name: "x" },
        ],
      ),
    ];
    expect(
      flattenTree(tree, treeBlocks).map((n) => [
        n.id,
        n.parentId,
        n.slotKey,
        n.depth,
      ]),
    ).toEqual([
      ["cols", null, null, 0],
      ["l1", "cols", "left", 1],
      ["l2", "cols", "left", 1],
      ["r1", "cols", "right", 1],
      ["r2", "cols", "right", 1],
    ]);
  });

  test("returns an empty list for an empty tree", () => {
    expect(flattenTree([], treeBlocks)).toEqual([]);
  });
});

describe("moveBlock", () => {
  test("reorders top-level siblings", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "x" },
      { id: "b", name: "x" },
      { id: "c", name: "x" },
    ];
    const moved = moveBlock(
      tree,
      "a",
      { parentId: null, index: 2 },
      treeBlocks,
    );
    expect(ids(moved)).toEqual(["-/b", "-/c", "-/a"]);
  });

  test("nests a top-level block into a group's slot", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "x" },
      group("g", [{ id: "c1", name: "x" }]),
    ];
    const moved = moveBlock(tree, "a", { parentId: "g", index: 0 }, treeBlocks);
    expect(ids(moved)).toEqual(["-/g", "g/a", "g/c1"]);
  });

  test("un-nests a child back to the top level", () => {
    const tree: readonly BlockNode[] = [group("g", [{ id: "c1", name: "x" }])];
    const moved = moveBlock(
      tree,
      "c1",
      { parentId: null, index: 0 },
      treeBlocks,
    );
    expect(ids(moved)).toEqual(["-/c1", "-/g"]);
  });

  test("refuses to move a block into itself", () => {
    const tree: readonly BlockNode[] = [group("g", [{ id: "c1", name: "x" }])];
    expect(moveBlock(tree, "g", { parentId: "g", index: 0 }, treeBlocks)).toBe(
      tree,
    );
  });

  test("refuses to move a block into its own descendant", () => {
    const tree: readonly BlockNode[] = [
      group("g", [group("inner", [{ id: "c", name: "x" }])]),
    ];
    expect(
      moveBlock(tree, "g", { parentId: "inner", index: 0 }, treeBlocks),
    ).toBe(tree);
  });

  test("is a no-op when the target parent has no slot to nest into", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "x" },
      { id: "leaf", name: "core/spacer" },
    ];
    expect(
      moveBlock(tree, "a", { parentId: "leaf", index: 0 }, treeBlocks),
    ).toBe(tree);
  });

  test("is a no-op when the source is absent", () => {
    const tree: readonly BlockNode[] = [{ id: "a", name: "x" }];
    expect(
      moveBlock(tree, "missing", { parentId: null, index: 0 }, treeBlocks),
    ).toBe(tree);
  });
});

describe("projectMove", () => {
  // a, b, then group g containing c — a typical mixed-depth outline.
  const FLAT = flattenTree(
    [
      { id: "a", name: "x" },
      { id: "b", name: "x" },
      group("g", [{ id: "c", name: "x" }]),
    ],
    treeBlocks,
  );
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
      slotKey: "content",
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
    const flat = flattenTree(
      [
        { id: "h", name: "core/heading" },
        { id: "leaf", name: "core/spacer" },
        { id: "x", name: "x" },
      ],
      treeBlocks,
    );
    const target = projectMove(flat, "x", "leaf", INDENT, INDENT);
    expect(target).toEqual({ parentId: null, index: 1 });
  });

  test("returns null when the active block is unknown", () => {
    expect(projectMove(FLAT, "zzz", "b", 0, INDENT)).toBeNull();
  });

  test("drops between second-slot rows into that slot, indexed within it", () => {
    const tree: readonly BlockNode[] = [
      columns(
        [
          { id: "l1", name: "x" },
          { id: "l2", name: "x" },
        ],
        [
          { id: "r1", name: "x" },
          { id: "r2", name: "x" },
        ],
      ),
    ];
    // Drag l1 down onto r1's row: it lands between r1 and r2.
    const target = projectMove(
      flattenTree(tree, treeBlocks),
      "l1",
      "r1",
      0,
      INDENT,
    );
    expect(target).toEqual({ parentId: "cols", slotKey: "right", index: 1 });
    const moved = moveBlock(
      tree,
      "l1",
      target ?? { parentId: null, index: 0 },
      treeBlocks,
    );
    const cols = findBlock(moved, "cols", treeBlocks);
    expect((cols?.attrs?.left as BlockNode[]).map((n) => n.id)).toEqual(["l2"]);
    expect((cols?.attrs?.right as BlockNode[]).map((n) => n.id)).toEqual([
      "r1",
      "l1",
      "r2",
    ]);
  });
});

describe("removeBlocks", () => {
  test("removes top-level and nested blocks in one pass", () => {
    const moved = removeBlocks(TREE, new Set(["a", "deep"]), treeBlocks);
    expect(ids(moved)).toEqual(["-/g", "g/c1", "g/c2"]);
  });

  test("returns the same reference when nothing matches", () => {
    expect(removeBlocks(TREE, new Set(["zzz"]), treeBlocks)).toBe(TREE);
  });

  test("returns the same reference for an empty id set", () => {
    expect(removeBlocks(TREE, new Set(), treeBlocks)).toBe(TREE);
  });

  test("leaves untouched branches referentially stable", () => {
    const moved = removeBlocks(TREE, new Set(["c1"]), treeBlocks);
    // The heading sibling is in a branch with no removal — its node is reused.
    expect(moved[0]).toBe(TREE[0]);
  });
});

describe("findParentId", () => {
  test("returns null for a top-level block", () => {
    expect(findParentId(TREE, "g", treeBlocks)).toBeNull();
  });

  test("returns the immediate slot owner for a nested block", () => {
    expect(findParentId(TREE, "c1", treeBlocks)).toBe("g");
  });

  test("walks past the first slot to deeper ancestors", () => {
    expect(findParentId(TREE, "deep", treeBlocks)).toBe("c2");
  });

  test("returns null when the block is absent", () => {
    expect(findParentId(TREE, "zzz", treeBlocks)).toBeNull();
  });

  test("finds a parent in a non-first slot", () => {
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
    expect(findParentId(tree, "r", treeBlocks)).toBe("cols");
  });
});

describe("duplicateBlock", () => {
  test("clones a top-level block right after it with a fresh id", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "core/heading", attrs: { text: "Hi" } },
      { id: "b", name: "core/spacer" },
    ];
    const { tree: next, newId } = duplicateBlock(tree, "a", treeBlocks);
    expect(next.map((n) => n.id)).toEqual(["a", newId, "b"]);
    expect(newId).not.toBe("a");
    expect(findBlock(next, newId ?? "", treeBlocks)?.attrs?.text).toBe("Hi");
  });

  test("clones a nested block within its own slot, ids rewritten deeply", () => {
    const { tree: next, newId } = duplicateBlock(TREE, "c2", treeBlocks);
    const slot = findBlock(next, "g", treeBlocks)?.attrs
      ?.content as readonly BlockNode[];
    expect(slot.map((n) => n.id)).toEqual(["c1", "c2", newId]);
    // The clone's nested child got a fresh id too (not the original "deep").
    const clone = findBlock(next, newId ?? "", treeBlocks);
    const childIds = (clone?.attrs?.content as readonly BlockNode[]).map(
      (n) => n.id,
    );
    expect(childIds).not.toContain("deep");
  });

  test("is a no-op with a null id when the source is absent", () => {
    expect(duplicateBlock(TREE, "zzz", treeBlocks)).toEqual({
      tree: TREE,
      newId: null,
    });
  });
});

describe("moveBlockBy", () => {
  const tree: readonly BlockNode[] = [
    { id: "a", name: "x" },
    { id: "b", name: "x" },
    { id: "c", name: "x" },
  ];

  test("moves a block down among its siblings", () => {
    expect(moveBlockBy(tree, "a", 1, treeBlocks).map((n) => n.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  test("moves a block up among its siblings", () => {
    expect(moveBlockBy(tree, "c", -1, treeBlocks).map((n) => n.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  test("reorders within a nested slot", () => {
    const nested: readonly BlockNode[] = [
      group("g", [
        { id: "c1", name: "x" },
        { id: "c2", name: "x" },
      ]),
    ];
    const moved = moveBlockBy(nested, "c1", 1, treeBlocks);
    const slot = findBlock(moved, "g", treeBlocks)?.attrs
      ?.content as readonly BlockNode[];
    expect(slot.map((n) => n.id)).toEqual(["c2", "c1"]);
  });

  test("is a no-op at the ends", () => {
    expect(moveBlockBy(tree, "a", -1, treeBlocks)).toBe(tree);
    expect(moveBlockBy(tree, "c", 1, treeBlocks)).toBe(tree);
  });

  test("is a no-op when the block is absent", () => {
    expect(moveBlockBy(tree, "zzz", 1, treeBlocks)).toBe(tree);
  });
});

describe("moveBlock into a named slot", () => {
  const tree: readonly BlockNode[] = [
    { id: "a", name: "core/heading" },
    columns([{ id: "l", name: "x" }], [{ id: "r", name: "x" }]),
  ];
  const slot = (t: readonly BlockNode[], key: string): readonly BlockNode[] =>
    findBlock(t, "cols", treeBlocks)?.attrs?.[key] as readonly BlockNode[];

  test("nests into the named (non-first) slot, leaving the others untouched", () => {
    const moved = moveBlock(
      tree,
      "a",
      {
        parentId: "cols",
        slotKey: "right",
        index: 0,
      },
      treeBlocks,
    );
    expect(slot(moved, "right").map((n) => n.id)).toEqual(["a", "r"]);
    expect(slot(moved, "left").map((n) => n.id)).toEqual(["l"]);
  });

  test("defaults to the first slot when slotKey is omitted", () => {
    const moved = moveBlock(
      tree,
      "a",
      { parentId: "cols", index: 0 },
      treeBlocks,
    );
    expect(slot(moved, "left").map((n) => n.id)).toEqual(["a", "l"]);
  });

  test("moving into an unset slot creates it (an empty slot is droppable)", () => {
    const sparse: readonly BlockNode[] = [
      { id: "a", name: "core/heading" },
      {
        id: "cols",
        name: "core/columns",
        attrs: { left: [{ id: "l", name: "x" }] },
      },
    ];
    const moved = moveBlock(
      sparse,
      "a",
      {
        parentId: "cols",
        slotKey: "right",
        index: 0,
      },
      treeBlocks,
    );
    expect(slot(moved, "right").map((n) => n.id)).toEqual(["a"]);
  });

  test("is a no-op when the target value is a non-slot scalar", () => {
    const scalar: readonly BlockNode[] = [
      { id: "a", name: "core/heading" },
      { id: "cols", name: "core/columns", attrs: { gap: "md" } },
    ];
    expect(
      moveBlock(
        scalar,
        "a",
        { parentId: "cols", slotKey: "gap", index: 0 },
        treeBlocks,
      ),
    ).toBe(scalar);
  });
});

describe("moveBlock allowedBlocks enforcement", () => {
  const tree: readonly BlockNode[] = [
    { id: "btn", name: "core/button" },
    { id: "g", name: "core/group", attrs: { content: [] } },
  ];
  const content = (t: readonly BlockNode[]): readonly BlockNode[] =>
    findBlock(t, "g", treeBlocks)?.attrs?.content as readonly BlockNode[];

  test("refuses a block whose name is not in the slot's allowed list", () => {
    expect(
      moveBlock(tree, "btn", { parentId: "g", index: 0 }, treeBlocks, [
        "core/heading",
      ]),
    ).toBe(tree);
  });

  test("permits a block whose name is in the allowed list", () => {
    const moved = moveBlock(
      tree,
      "btn",
      { parentId: "g", index: 0 },
      treeBlocks,
      ["core/button"],
    );
    expect(content(moved).map((n) => n.id)).toEqual(["btn"]);
  });

  test("an undefined allowed list permits any block", () => {
    const moved = moveBlock(
      tree,
      "btn",
      { parentId: "g", index: 0 },
      treeBlocks,
    );
    expect(content(moved).map((n) => n.id)).toEqual(["btn"]);
  });
});

describe("insertBlockAt", () => {
  const tree: readonly BlockNode[] = [
    columns([{ id: "l", name: "x" }], [{ id: "r", name: "x" }]),
  ];

  test("inserts a new block into a named slot at an index", () => {
    const next = insertBlockAt(
      tree,
      { id: "n", name: "core/heading" },
      { parentId: "cols", slotKey: "right", index: 0 },
      treeBlocks,
    );
    expect(
      (
        findBlock(next, "cols", treeBlocks)?.attrs
          ?.right as readonly BlockNode[]
      ).map((n) => n.id),
    ).toEqual(["n", "r"]);
  });

  test("inserts at the top level when parentId is null", () => {
    const next = insertBlockAt(
      [{ id: "a", name: "x" }],
      { id: "n", name: "y" },
      { parentId: null, index: 0 },
      treeBlocks,
    );
    expect(next.map((node) => node.id)).toEqual(["n", "a"]);
  });

  test("refuses a block not in the slot's allowed list", () => {
    expect(
      insertBlockAt(
        tree,
        { id: "n", name: "core/button" },
        { parentId: "cols", slotKey: "right", index: 0 },
        treeBlocks,
        ["core/heading"],
      ),
    ).toBe(tree);
  });

  test("creates an unset slot's array on first insert", () => {
    // A freshly inserted container has no array for its declared slots yet.
    // Inserting into one must create it rather than no-op, so the in-canvas
    // "Add a block" affordance can fill an empty slot. The caller resolves the
    // slot key from the registry, so it always names a real slot.
    const empty: readonly BlockNode[] = [{ id: "cols", name: "core/columns" }];
    const next = insertBlockAt(
      empty,
      { id: "n", name: "core/heading" },
      { parentId: "cols", slotKey: "left", index: 0 },
      treeBlocks,
    );
    expect(
      (
        findBlock(next, "cols", treeBlocks)?.attrs?.left as readonly BlockNode[]
      ).map((node) => node.id),
    ).toEqual(["n"]);
  });

  test("is a no-op when the target value is a non-slot scalar", () => {
    const scalar: readonly BlockNode[] = [
      { id: "cols", name: "core/columns", attrs: { gap: "md" } },
    ];
    expect(
      insertBlockAt(
        scalar,
        { id: "n", name: "x" },
        { parentId: "cols", slotKey: "gap", index: 0 },
        treeBlocks,
      ),
    ).toBe(scalar);
  });
});

describe("selectionRoots", () => {
  test("drops a selected block that is nested inside another selection", () => {
    // g and its descendant deep are both selected → only g is a root.
    expect(selectionRoots(TREE, new Set(["g", "deep"]), treeBlocks)).toEqual([
      "g",
    ]);
  });

  test("keeps independent selections", () => {
    expect(selectionRoots(TREE, new Set(["a", "c1"]), treeBlocks)).toEqual([
      "a",
      "c1",
    ]);
  });

  test("returns an empty array for an empty set", () => {
    expect(selectionRoots(TREE, new Set(), treeBlocks)).toEqual([]);
  });
});

describe("groupBlocks", () => {
  const flat: readonly BlockNode[] = [
    { id: "a", name: "core/x" },
    { id: "b", name: "core/y" },
    { id: "c", name: "core/z" },
  ];

  test("wraps sibling selection roots in a group at the first position", () => {
    const result = groupBlocks(flat, new Set(["a", "b"]), "grp", treeBlocks);
    expect(result).not.toBeNull();
    expect(result?.tree.map((n) => n.id)).toEqual(["grp", "c"]);
    const grouped = result?.tree[0];
    expect(grouped?.name).toBe("core/group");
    // Box carries no layout attr — layout is a style, not a block prop.
    expect(grouped?.attrs?.layout).toBeUndefined();
    expect((grouped?.attrs?.content as BlockNode[]).map((n) => n.id)).toEqual([
      "a",
      "b",
    ]);
  });

  test("orders grouped children by document order, not selection order", () => {
    const result = groupBlocks(flat, new Set(["b", "a"]), "grp", treeBlocks);
    expect(
      (result?.tree[0]?.attrs?.content as BlockNode[]).map((n) => n.id),
    ).toEqual(["a", "b"]);
  });

  test("groups a single block", () => {
    const result = groupBlocks(flat, new Set(["b"]), "grp", treeBlocks);
    expect(result?.tree.map((n) => n.id)).toEqual(["a", "grp", "c"]);
  });

  test("pulls non-contiguous siblings together at the first position", () => {
    const result = groupBlocks(flat, new Set(["a", "c"]), "grp", treeBlocks);
    expect(result?.tree.map((n) => n.id)).toEqual(["grp", "b"]);
    expect(
      (result?.tree[0]?.attrs?.content as BlockNode[]).map((n) => n.id),
    ).toEqual(["a", "c"]);
  });

  test("refuses to group blocks that don't share a parent", () => {
    // `a` is top-level; `c1` is nested inside `g` — different parents.
    expect(
      groupBlocks(TREE, new Set(["a", "c1"]), "grp", treeBlocks),
    ).toBeNull();
  });
});

describe("ungroupBlock", () => {
  const withGroup: readonly BlockNode[] = [
    group("g", [
      { id: "c1", name: "core/x" },
      { id: "c2", name: "core/y" },
    ]),
    { id: "d", name: "core/z" },
  ];

  test("replaces a group with its children at its position", () => {
    const result = ungroupBlock(withGroup, "g", treeBlocks);
    expect(result?.tree.map((n) => n.id)).toEqual(["c1", "c2", "d"]);
    expect(result?.childIds).toEqual(["c1", "c2"]);
  });

  test("returns null for a block with no children", () => {
    expect(ungroupBlock(withGroup, "d", treeBlocks)).toBeNull();
  });

  test("refuses a multi-slot block (unwrapping one slot would drop the rest)", () => {
    const tree: readonly BlockNode[] = [
      columns([{ id: "l", name: "x" }], [{ id: "r", name: "y" }]),
    ];
    expect(ungroupBlock(tree, "cols", treeBlocks)).toBeNull();
    expect(canUngroupBlock(tree, "cols", treeBlocks)).toBe(false);
  });

  test("canUngroupBlock matches the op: true only for a single filled slot", () => {
    expect(canUngroupBlock(withGroup, "g", treeBlocks)).toBe(true);
    expect(canUngroupBlock(withGroup, "d", treeBlocks)).toBe(false);
    expect(canUngroupBlock(withGroup, "missing", treeBlocks)).toBe(false);
  });
});

describe("collectBlocks", () => {
  test("returns the selected root nodes whole", () => {
    expect(collectBlocks(TREE, new Set(["a"]), treeBlocks)).toEqual([TREE[0]]);
  });

  test("returns roots in document order, not selection order", () => {
    // Set iterates g before a, but copy must preserve the document sequence.
    expect(
      collectBlocks(TREE, new Set(["g", "a"]), treeBlocks).map((n) => n.id),
    ).toEqual(["a", "g"]);
  });

  test("collapses a nested selection to its containing root (whole subtree)", () => {
    const out = collectBlocks(TREE, new Set(["g", "deep"]), treeBlocks);
    expect(out.map((n) => n.id)).toEqual(["g"]);
  });
});

describe("findBlock", () => {
  test("finds a top-level block", () => {
    expect(findBlock(TREE, "g", treeBlocks)?.name).toBe("core/group");
  });

  test("finds a deeply nested block", () => {
    expect(findBlock(TREE, "deep", treeBlocks)?.id).toBe("deep");
  });

  test("returns undefined when absent", () => {
    expect(findBlock(TREE, "zzz", treeBlocks)).toBeUndefined();
  });
});

const tableTree = (): readonly BlockNode[] => [
  {
    id: "t1",
    name: "core/table",
    attrs: {
      rows: [
        {
          id: "hr",
          name: "core/table-header-row",
          attrs: {
            cells: [
              { id: "h1", name: "core/table-header-cell" },
              { id: "h2", name: "core/table-header-cell" },
            ],
          },
        },
        {
          id: "br",
          name: "core/table-body-row",
          attrs: {
            cells: [
              { id: "b1", name: "core/table-cell" },
              { id: "b2", name: "core/table-cell" },
            ],
          },
        },
      ],
    },
  },
];

const tableRows = (tree: readonly BlockNode[]): readonly BlockNode[] =>
  (findBlock(tree, "t1", treeBlocks)?.attrs?.rows ??
    []) as readonly BlockNode[];

const rowCells = (row: BlockNode | undefined): readonly BlockNode[] =>
  (row?.attrs?.cells ?? []) as readonly BlockNode[];

describe("appendTableColumn", () => {
  test("appends a cell to every row, matching each row's cell type", () => {
    const rows = tableRows(appendTableColumn(tableTree(), "t1", treeBlocks));
    expect(rowCells(rows[0]).map((c) => c.name)).toEqual([
      "core/table-header-cell",
      "core/table-header-cell",
      "core/table-header-cell",
    ]);
    expect(rowCells(rows[1]).map((c) => c.name)).toEqual([
      "core/table-cell",
      "core/table-cell",
      "core/table-cell",
    ]);
  });

  test("mints fresh, unique ids for the appended cells", () => {
    const rows = tableRows(appendTableColumn(tableTree(), "t1", treeBlocks));
    const newHeader = rowCells(rows[0])[2];
    const newBody = rowCells(rows[1])[2];
    expect(newHeader?.id).toBeTruthy();
    expect(newBody?.id).toBeTruthy();
    expect(newHeader?.id).not.toBe(newBody?.id);
  });

  test("descends into a nested table", () => {
    const tree: readonly BlockNode[] = [group("g", tableTree())];
    const next = appendTableColumn(tree, "t1", treeBlocks);
    expect(next).not.toBe(tree);
    expect(rowCells(tableRows(next)[0])).toHaveLength(3);
  });

  test("no-ops (same ref) when the id isn't a table or has no rows", () => {
    const tree = tableTree();
    expect(appendTableColumn(tree, "hr", treeBlocks)).toBe(tree);
    expect(appendTableColumn(tree, "missing", treeBlocks)).toBe(tree);
    const empty: readonly BlockNode[] = [
      { id: "t1", name: "core/table", attrs: { rows: [] } },
    ];
    expect(appendTableColumn(empty, "t1", treeBlocks)).toBe(empty);
  });
});

describe("appendTableRow", () => {
  test("appends a body row with a cell per existing column", () => {
    const rows = tableRows(appendTableRow(tableTree(), "t1", treeBlocks));
    expect(rows.map((r) => r.name)).toEqual([
      "core/table-header-row",
      "core/table-body-row",
      "core/table-body-row",
    ]);
    expect(rowCells(rows[2]).map((c) => c.name)).toEqual([
      "core/table-cell",
      "core/table-cell",
    ]);
    expect(rows[2]?.id).toBeTruthy();
  });

  test("seeds a single cell when the table is empty", () => {
    const tree: readonly BlockNode[] = [
      { id: "t1", name: "core/table", attrs: { rows: [] } },
    ];
    const rows = tableRows(appendTableRow(tree, "t1", treeBlocks));
    expect(rows).toHaveLength(1);
    expect(rowCells(rows[0])).toHaveLength(1);
  });

  test("no-ops (same ref) when the id isn't a table", () => {
    const tree = tableTree();
    expect(appendTableRow(tree, "missing", treeBlocks)).toBe(tree);
  });
});

describe("removeTableColumn", () => {
  test("drops the last cell from every row", () => {
    const rows = tableRows(removeTableColumn(tableTree(), "t1", treeBlocks));
    expect(rowCells(rows[0]).map((c) => c.id)).toEqual(["h1"]);
    expect(rowCells(rows[1]).map((c) => c.id)).toEqual(["b1"]);
  });

  test("no-ops (same ref) at one column, or when the id isn't a table", () => {
    const tree = tableTree();
    expect(removeTableColumn(tree, "missing", treeBlocks)).toBe(tree);
    const oneCol: readonly BlockNode[] = [
      {
        id: "t1",
        name: "core/table",
        attrs: {
          rows: [
            {
              id: "r",
              name: "core/table-body-row",
              attrs: { cells: [{ id: "c", name: "core/table-cell" }] },
            },
          ],
        },
      },
    ];
    expect(removeTableColumn(oneCol, "t1", treeBlocks)).toBe(oneCol);
  });
});

describe("removeTableRow", () => {
  test("drops the last row", () => {
    const rows = tableRows(removeTableRow(tableTree(), "t1", treeBlocks));
    expect(rows.map((r) => r.id)).toEqual(["hr"]);
  });

  test("no-ops (same ref) at one row, or when the id isn't a table", () => {
    const tree = tableTree();
    expect(removeTableRow(tree, "missing", treeBlocks)).toBe(tree);
    const oneRow: readonly BlockNode[] = [
      {
        id: "t1",
        name: "core/table",
        attrs: {
          rows: [
            { id: "hr", name: "core/table-header-row", attrs: { cells: [] } },
          ],
        },
      },
    ];
    expect(removeTableRow(oneRow, "t1", treeBlocks)).toBe(oneRow);
  });
});

describe("enclosingTableId", () => {
  test("resolves the table from the table, a row, or a cell", () => {
    const tree = tableTree();
    expect(enclosingTableId(tree, "t1", treeBlocks)).toBe("t1");
    expect(enclosingTableId(tree, "hr", treeBlocks)).toBe("t1");
    expect(enclosingTableId(tree, "h1", treeBlocks)).toBe("t1");
    expect(enclosingTableId(tree, "b2", treeBlocks)).toBe("t1");
  });

  test("returns null outside any table, or for a missing id", () => {
    expect(enclosingTableId(TREE, "a", treeBlocks)).toBeNull();
    expect(enclosingTableId(tableTree(), "missing", treeBlocks)).toBeNull();
  });
});

describe("a block with two slots", () => {
  const TWO_SLOT: readonly BlockNode[] = [
    columns(
      [
        { id: "l1", name: "x" },
        { id: "l2", name: "x" },
      ],
      [
        { id: "r1", name: "x" },
        { id: "r2", name: "x" },
      ],
    ),
  ];
  const slot = (
    tree: readonly BlockNode[],
    key: "left" | "right",
  ): readonly BlockNode[] =>
    findBlock(tree, "cols", treeBlocks)?.attrs?.[key] as readonly BlockNode[];
  const slotIds = (tree: readonly BlockNode[], key: "left" | "right") =>
    slot(tree, key).map((n) => n.id);

  test("duplicate lands right after the node in its own slot", () => {
    const { tree, newId } = duplicateBlock(TWO_SLOT, "r1", treeBlocks);
    expect(slotIds(tree, "right")).toEqual(["r1", newId, "r2"]);
    expect(slotIds(tree, "left")).toEqual(["l1", "l2"]);
  });

  test("paste after a second-slot node lands right after it in that slot", () => {
    const { tree, newIds } = pasteBlocks(
      TWO_SLOT,
      [{ id: "p", name: "x" }],
      "r1",
      treeBlocks,
    );
    expect(slotIds(tree, "right")).toEqual(["r1", ...newIds, "r2"]);
    expect(slotIds(tree, "left")).toEqual(["l1", "l2"]);
  });

  test("move up and down reorders within the second slot", () => {
    const down = moveBlockBy(TWO_SLOT, "r1", 1, treeBlocks);
    expect(slotIds(down, "right")).toEqual(["r2", "r1"]);
    expect(slotIds(down, "left")).toEqual(["l1", "l2"]);
    const back = moveBlockBy(down, "r1", -1, treeBlocks);
    expect(slotIds(back, "right")).toEqual(["r1", "r2"]);
  });

  test("group wraps second-slot siblings in place inside that slot", () => {
    const result = groupBlocks(
      TWO_SLOT,
      new Set(["r1", "r2"]),
      "grp",
      treeBlocks,
    );
    expect(result).not.toBeNull();
    const tree = result?.tree ?? [];
    expect(slotIds(tree, "right")).toEqual(["grp"]);
    expect(slotIds(tree, "left")).toEqual(["l1", "l2"]);
    const grouped = findBlock(tree, "grp", treeBlocks)?.attrs
      ?.content as BlockNode[];
    expect(grouped.map((n) => n.id)).toEqual(["r1", "r2"]);
  });

  test("refuses to group one node from each slot", () => {
    const selection = new Set(["l1", "r1"]);
    expect(groupBlocks(TWO_SLOT, selection, "grp", treeBlocks)).toBeNull();
    expect(canGroupSelection(TWO_SLOT, selection, treeBlocks)).toBe(false);
  });

  test("ungroup splices a second-slot container's children into that slot", () => {
    const tree: readonly BlockNode[] = [
      columns(
        [{ id: "l1", name: "x" }],
        [
          { id: "r1", name: "x" },
          group("inner", [
            { id: "i1", name: "x" },
            { id: "i2", name: "x" },
          ]),
          { id: "r2", name: "x" },
        ],
      ),
    ];
    const result = ungroupBlock(tree, "inner", treeBlocks);
    const next = result?.tree ?? [];
    expect(slotIds(next, "right")).toEqual(["r1", "i1", "i2", "r2"]);
    expect(slotIds(next, "left")).toEqual(["l1"]);
  });
});

describe("attrs no slot declares", () => {
  const team = (people: readonly JsonValue[]): readonly BlockNode[] => [
    { id: "t1", name: "acme/team", attrs: { people } },
  ];

  test.each([
    ["an empty data array", []],
    ["a data array of id/name objects", [{ id: "1", name: "Alice" }]],
  ])("treats %s as data in every walk", (_, people) => {
    const tree = team(people);

    expect(findBlock(tree, "1", treeBlocks)).toBeUndefined();
    expect(flattenTree(tree, treeBlocks)).toEqual([
      expect.objectContaining({ id: "t1", hasSlot: false }),
    ]);
    expect(removeBlocks(tree, new Set(["1"]), treeBlocks)).toBe(tree);
    const { tree: duplicated } = duplicateBlock(tree, "t1", treeBlocks);
    expect(duplicated[1]?.attrs?.people).toEqual(people);
  });

  test("never walks into an unregistered block's children", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "u1",
        name: "acme/missing",
        attrs: { content: [{ id: "hidden", name: "core/heading" }] },
      },
    ];

    expect(findBlock(tree, "hidden", treeBlocks)).toBeUndefined();
    expect(flattenTree(tree, treeBlocks).map((n) => n.id)).toEqual(["u1"]);
  });
});
