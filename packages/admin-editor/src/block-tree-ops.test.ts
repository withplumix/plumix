import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";

import {
  appendTableColumn,
  appendTableRow,
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
  projectMove,
  removeBlocks,
  removeTableColumn,
  removeTableRow,
  selectionRoots,
  slotKeys,
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

describe("removeBlocks", () => {
  test("removes top-level and nested blocks in one pass", () => {
    const moved = removeBlocks(TREE, new Set(["a", "deep"]));
    expect(ids(moved)).toEqual(["-/g", "g/c1", "g/c2"]);
  });

  test("returns the same reference when nothing matches", () => {
    expect(removeBlocks(TREE, new Set(["zzz"]))).toBe(TREE);
  });

  test("returns the same reference for an empty id set", () => {
    expect(removeBlocks(TREE, new Set())).toBe(TREE);
  });

  test("leaves untouched branches referentially stable", () => {
    const moved = removeBlocks(TREE, new Set(["c1"]));
    // The heading sibling is in a branch with no removal — its node is reused.
    expect(moved[0]).toBe(TREE[0]);
  });
});

describe("findParentId", () => {
  test("returns null for a top-level block", () => {
    expect(findParentId(TREE, "g")).toBeNull();
  });

  test("returns the immediate slot owner for a nested block", () => {
    expect(findParentId(TREE, "c1")).toBe("g");
  });

  test("walks past the first slot to deeper ancestors", () => {
    expect(findParentId(TREE, "deep")).toBe("c2");
  });

  test("returns null when the block is absent", () => {
    expect(findParentId(TREE, "zzz")).toBeNull();
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
    expect(findParentId(tree, "r")).toBe("cols");
  });
});

describe("duplicateBlock", () => {
  test("clones a top-level block right after it with a fresh id", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "core/heading", attrs: { text: "Hi" } },
      { id: "b", name: "core/spacer" },
    ];
    const { tree: next, newId } = duplicateBlock(tree, "a");
    expect(next.map((n) => n.id)).toEqual(["a", newId, "b"]);
    expect(newId).not.toBe("a");
    expect(findBlock(next, newId ?? "")?.attrs?.text).toBe("Hi");
  });

  test("clones a nested block within its own slot, ids rewritten deeply", () => {
    const { tree: next, newId } = duplicateBlock(TREE, "c2");
    const slot = findBlock(next, "g")?.attrs?.content as readonly BlockNode[];
    expect(slot.map((n) => n.id)).toEqual(["c1", "c2", newId]);
    // The clone's nested child got a fresh id too (not the original "deep").
    const clone = findBlock(next, newId ?? "");
    const childIds = (clone?.attrs?.content as readonly BlockNode[]).map(
      (n) => n.id,
    );
    expect(childIds).not.toContain("deep");
  });

  test("is a no-op with a null id when the source is absent", () => {
    expect(duplicateBlock(TREE, "zzz")).toEqual({ tree: TREE, newId: null });
  });
});

describe("moveBlockBy", () => {
  const tree: readonly BlockNode[] = [
    { id: "a", name: "x" },
    { id: "b", name: "x" },
    { id: "c", name: "x" },
  ];

  test("moves a block down among its siblings", () => {
    expect(moveBlockBy(tree, "a", 1).map((n) => n.id)).toEqual(["b", "a", "c"]);
  });

  test("moves a block up among its siblings", () => {
    expect(moveBlockBy(tree, "c", -1).map((n) => n.id)).toEqual([
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
    const moved = moveBlockBy(nested, "c1", 1);
    const slot = findBlock(moved, "g")?.attrs?.content as readonly BlockNode[];
    expect(slot.map((n) => n.id)).toEqual(["c2", "c1"]);
  });

  test("is a no-op at the ends", () => {
    expect(moveBlockBy(tree, "a", -1)).toBe(tree);
    expect(moveBlockBy(tree, "c", 1)).toBe(tree);
  });

  test("is a no-op when the block is absent", () => {
    expect(moveBlockBy(tree, "zzz", 1)).toBe(tree);
  });
});

describe("slotKeys", () => {
  test("lists every slot key in declaration order", () => {
    expect(
      slotKeys(columns([{ id: "l", name: "x" }], [{ id: "r", name: "x" }])),
    ).toEqual(["left", "right"]);
  });

  test("returns an empty list for a slotless block", () => {
    expect(
      slotKeys({ id: "h", name: "core/heading", attrs: { text: "hi" } }),
    ).toEqual([]);
  });
});

describe("moveBlock into a named slot", () => {
  const tree: readonly BlockNode[] = [
    { id: "a", name: "core/heading" },
    columns([{ id: "l", name: "x" }], [{ id: "r", name: "x" }]),
  ];
  const slot = (t: readonly BlockNode[], key: string): readonly BlockNode[] =>
    findBlock(t, "cols")?.attrs?.[key] as readonly BlockNode[];

  test("nests into the named (non-first) slot, leaving the others untouched", () => {
    const moved = moveBlock(tree, "a", {
      parentId: "cols",
      slotKey: "right",
      index: 0,
    });
    expect(slot(moved, "right").map((n) => n.id)).toEqual(["a", "r"]);
    expect(slot(moved, "left").map((n) => n.id)).toEqual(["l"]);
  });

  test("defaults to the first slot when slotKey is omitted", () => {
    const moved = moveBlock(tree, "a", { parentId: "cols", index: 0 });
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
    const moved = moveBlock(sparse, "a", {
      parentId: "cols",
      slotKey: "right",
      index: 0,
    });
    expect(slot(moved, "right").map((n) => n.id)).toEqual(["a"]);
  });

  test("is a no-op when the target value is a non-slot scalar", () => {
    const scalar: readonly BlockNode[] = [
      { id: "a", name: "core/heading" },
      { id: "cols", name: "core/columns", attrs: { gap: "md" } },
    ];
    expect(
      moveBlock(scalar, "a", { parentId: "cols", slotKey: "gap", index: 0 }),
    ).toBe(scalar);
  });
});

describe("moveBlock allowedBlocks enforcement", () => {
  const tree: readonly BlockNode[] = [
    { id: "btn", name: "core/button" },
    { id: "g", name: "core/group", attrs: { content: [] } },
  ];
  const content = (t: readonly BlockNode[]): readonly BlockNode[] =>
    findBlock(t, "g")?.attrs?.content as readonly BlockNode[];

  test("refuses a block whose name is not in the slot's allowed list", () => {
    expect(
      moveBlock(tree, "btn", { parentId: "g", index: 0 }, ["core/heading"]),
    ).toBe(tree);
  });

  test("permits a block whose name is in the allowed list", () => {
    const moved = moveBlock(tree, "btn", { parentId: "g", index: 0 }, [
      "core/button",
    ]);
    expect(content(moved).map((n) => n.id)).toEqual(["btn"]);
  });

  test("an undefined allowed list permits any block", () => {
    const moved = moveBlock(tree, "btn", { parentId: "g", index: 0 });
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
    );
    expect(
      (findBlock(next, "cols")?.attrs?.right as readonly BlockNode[]).map(
        (n) => n.id,
      ),
    ).toEqual(["n", "r"]);
  });

  test("inserts at the top level when parentId is null", () => {
    const next = insertBlockAt(
      [{ id: "a", name: "x" }],
      { id: "n", name: "y" },
      { parentId: null, index: 0 },
    );
    expect(next.map((node) => node.id)).toEqual(["n", "a"]);
  });

  test("refuses a block not in the slot's allowed list", () => {
    expect(
      insertBlockAt(
        tree,
        { id: "n", name: "core/button" },
        { parentId: "cols", slotKey: "right", index: 0 },
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
    );
    expect(
      (findBlock(next, "cols")?.attrs?.left as readonly BlockNode[]).map(
        (node) => node.id,
      ),
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
      ),
    ).toBe(scalar);
  });
});

describe("selectionRoots", () => {
  test("drops a selected block that is nested inside another selection", () => {
    // g and its descendant deep are both selected → only g is a root.
    expect(selectionRoots(TREE, new Set(["g", "deep"]))).toEqual(["g"]);
  });

  test("keeps independent selections", () => {
    expect(selectionRoots(TREE, new Set(["a", "c1"]))).toEqual(["a", "c1"]);
  });

  test("returns an empty array for an empty set", () => {
    expect(selectionRoots(TREE, new Set())).toEqual([]);
  });
});

describe("groupBlocks", () => {
  const flat: readonly BlockNode[] = [
    { id: "a", name: "core/x" },
    { id: "b", name: "core/y" },
    { id: "c", name: "core/z" },
  ];

  test("wraps sibling selection roots in a group at the first position", () => {
    const result = groupBlocks(flat, new Set(["a", "b"]), "grp");
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
    const result = groupBlocks(flat, new Set(["b", "a"]), "grp");
    expect(
      (result?.tree[0]?.attrs?.content as BlockNode[]).map((n) => n.id),
    ).toEqual(["a", "b"]);
  });

  test("groups a single block", () => {
    const result = groupBlocks(flat, new Set(["b"]), "grp");
    expect(result?.tree.map((n) => n.id)).toEqual(["a", "grp", "c"]);
  });

  test("pulls non-contiguous siblings together at the first position", () => {
    const result = groupBlocks(flat, new Set(["a", "c"]), "grp");
    expect(result?.tree.map((n) => n.id)).toEqual(["grp", "b"]);
    expect(
      (result?.tree[0]?.attrs?.content as BlockNode[]).map((n) => n.id),
    ).toEqual(["a", "c"]);
  });

  test("refuses to group blocks that don't share a parent", () => {
    // `a` is top-level; `c1` is nested inside `g` — different parents.
    expect(groupBlocks(TREE, new Set(["a", "c1"]), "grp")).toBeNull();
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
    const result = ungroupBlock(withGroup, "g");
    expect(result?.tree.map((n) => n.id)).toEqual(["c1", "c2", "d"]);
    expect(result?.childIds).toEqual(["c1", "c2"]);
  });

  test("returns null for a block with no children", () => {
    expect(ungroupBlock(withGroup, "d")).toBeNull();
  });

  test("refuses a multi-slot block (unwrapping one slot would drop the rest)", () => {
    const tree: readonly BlockNode[] = [
      columns([{ id: "l", name: "x" }], [{ id: "r", name: "y" }]),
    ];
    expect(ungroupBlock(tree, "cols")).toBeNull();
    expect(canUngroupBlock(tree, "cols")).toBe(false);
  });

  test("canUngroupBlock matches the op: true only for a single filled slot", () => {
    expect(canUngroupBlock(withGroup, "g")).toBe(true);
    expect(canUngroupBlock(withGroup, "d")).toBe(false);
    expect(canUngroupBlock(withGroup, "missing")).toBe(false);
  });
});

describe("collectBlocks", () => {
  test("returns the selected root nodes whole", () => {
    expect(collectBlocks(TREE, new Set(["a"]))).toEqual([TREE[0]]);
  });

  test("returns roots in document order, not selection order", () => {
    // Set iterates g before a, but copy must preserve the document sequence.
    expect(collectBlocks(TREE, new Set(["g", "a"])).map((n) => n.id)).toEqual([
      "a",
      "g",
    ]);
  });

  test("collapses a nested selection to its containing root (whole subtree)", () => {
    const out = collectBlocks(TREE, new Set(["g", "deep"]));
    expect(out.map((n) => n.id)).toEqual(["g"]);
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
  (findBlock(tree, "t1")?.attrs?.rows ?? []) as readonly BlockNode[];

const rowCells = (row: BlockNode | undefined): readonly BlockNode[] =>
  (row?.attrs?.cells ?? []) as readonly BlockNode[];

describe("appendTableColumn", () => {
  test("appends a cell to every row, matching each row's cell type", () => {
    const rows = tableRows(appendTableColumn(tableTree(), "t1"));
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
    const rows = tableRows(appendTableColumn(tableTree(), "t1"));
    const newHeader = rowCells(rows[0])[2];
    const newBody = rowCells(rows[1])[2];
    expect(newHeader?.id).toBeTruthy();
    expect(newBody?.id).toBeTruthy();
    expect(newHeader?.id).not.toBe(newBody?.id);
  });

  test("descends into a nested table", () => {
    const tree: readonly BlockNode[] = [group("g", tableTree())];
    const next = appendTableColumn(tree, "t1");
    expect(next).not.toBe(tree);
    expect(rowCells(tableRows(next)[0])).toHaveLength(3);
  });

  test("no-ops (same ref) when the id isn't a table or has no rows", () => {
    const tree = tableTree();
    expect(appendTableColumn(tree, "hr")).toBe(tree);
    expect(appendTableColumn(tree, "missing")).toBe(tree);
    const empty: readonly BlockNode[] = [
      { id: "t1", name: "core/table", attrs: { rows: [] } },
    ];
    expect(appendTableColumn(empty, "t1")).toBe(empty);
  });
});

describe("appendTableRow", () => {
  test("appends a body row with a cell per existing column", () => {
    const rows = tableRows(appendTableRow(tableTree(), "t1"));
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
    const rows = tableRows(appendTableRow(tree, "t1"));
    expect(rows).toHaveLength(1);
    expect(rowCells(rows[0])).toHaveLength(1);
  });

  test("no-ops (same ref) when the id isn't a table", () => {
    const tree = tableTree();
    expect(appendTableRow(tree, "missing")).toBe(tree);
  });
});

describe("removeTableColumn", () => {
  test("drops the last cell from every row", () => {
    const rows = tableRows(removeTableColumn(tableTree(), "t1"));
    expect(rowCells(rows[0]).map((c) => c.id)).toEqual(["h1"]);
    expect(rowCells(rows[1]).map((c) => c.id)).toEqual(["b1"]);
  });

  test("no-ops (same ref) at one column, or when the id isn't a table", () => {
    const tree = tableTree();
    expect(removeTableColumn(tree, "missing")).toBe(tree);
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
    expect(removeTableColumn(oneCol, "t1")).toBe(oneCol);
  });
});

describe("removeTableRow", () => {
  test("drops the last row", () => {
    const rows = tableRows(removeTableRow(tableTree(), "t1"));
    expect(rows.map((r) => r.id)).toEqual(["hr"]);
  });

  test("no-ops (same ref) at one row, or when the id isn't a table", () => {
    const tree = tableTree();
    expect(removeTableRow(tree, "missing")).toBe(tree);
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
    expect(removeTableRow(oneRow, "t1")).toBe(oneRow);
  });
});

describe("enclosingTableId", () => {
  test("resolves the table from the table, a row, or a cell", () => {
    const tree = tableTree();
    expect(enclosingTableId(tree, "t1")).toBe("t1");
    expect(enclosingTableId(tree, "hr")).toBe("t1");
    expect(enclosingTableId(tree, "h1")).toBe("t1");
    expect(enclosingTableId(tree, "b2")).toBe("t1");
  });

  test("returns null outside any table, or for a missing id", () => {
    expect(enclosingTableId(TREE, "a")).toBeNull();
    expect(enclosingTableId(tableTree(), "missing")).toBeNull();
  });
});
