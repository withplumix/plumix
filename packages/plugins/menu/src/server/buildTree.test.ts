import { describe, expect, test } from "vitest";

import { buildTree } from "./buildTree.js";

interface Item {
  readonly id: number;
  readonly parentId: number | null;
  readonly sortOrder: number;
}

const item = (id: number, parentId: number | null, sortOrder = 0): Item => ({
  id,
  parentId,
  sortOrder,
});

describe("buildTree", () => {
  test("empty input yields empty tree and no orphans", () => {
    expect(buildTree<Item>([])).toEqual({ tree: [], orphans: [] });
  });

  test("single root", () => {
    const { tree, orphans } = buildTree([item(1, null)]);
    expect(orphans).toEqual([]);
    expect(tree).toEqual([
      { id: 1, parentId: null, sortOrder: 0, children: [] },
    ]);
  });

  test("multiple roots stay at depth 0", () => {
    const { tree } = buildTree([
      item(1, null, 0),
      item(2, null, 1),
      item(3, null, 2),
    ]);
    expect(tree.map((n) => n.id)).toEqual([1, 2, 3]);
  });

  test("two-level hierarchy nests children under parent", () => {
    const { tree, orphans } = buildTree([
      item(1, null),
      item(2, 1),
      item(3, 1),
    ]);
    expect(orphans).toEqual([]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe(1);
    expect(tree[0]?.children.map((c) => c.id)).toEqual([2, 3]);
  });

  test("siblings sorted by sortOrder then id", () => {
    const { tree } = buildTree([
      item(10, null, 5),
      item(20, null, 1),
      item(30, null, 1),
    ]);
    // sortOrder 1 ties (id 20, 30) — id ascending wins; sortOrder 5 (id 10) last.
    expect(tree.map((n) => n.id)).toEqual([20, 30, 10]);
  });

  test("deep nesting builds nested children at each level", () => {
    const { tree } = buildTree([
      item(1, null),
      item(2, 1),
      item(3, 2),
      item(4, 3),
    ]);
    expect(tree[0]?.id).toBe(1);
    expect(tree[0]?.children[0]?.id).toBe(2);
    expect(tree[0]?.children[0]?.children[0]?.id).toBe(3);
    expect(tree[0]?.children[0]?.children[0]?.children[0]?.id).toBe(4);
  });

  test("orphans (parent id not in input) are returned separately, not in tree", () => {
    const { tree, orphans } = buildTree([item(1, null), item(2, 999)]);
    expect(tree.map((n) => n.id)).toEqual([1]);
    expect(orphans.map((n) => n.id)).toEqual([2]);
  });

  test("cycle (a parent b, b parent a) yields empty tree with both as orphans", () => {
    const { tree, orphans } = buildTree([item(1, 2), item(2, 1)]);
    expect(tree).toEqual([]);
    expect(orphans.map((n) => n.id).sort()).toEqual([1, 2]);
  });

  test("self-parent is treated as orphan", () => {
    const { tree, orphans } = buildTree([item(1, 1)]);
    expect(tree).toEqual([]);
    expect(orphans.map((n) => n.id)).toEqual([1]);
  });

  test("preserves additional payload fields on items", () => {
    interface Rich extends Item {
      readonly label: string;
    }
    const items: Rich[] = [
      { id: 1, parentId: null, sortOrder: 0, label: "root" },
      { id: 2, parentId: 1, sortOrder: 0, label: "child" },
    ];
    const { tree } = buildTree(items);
    expect(tree[0]?.label).toBe("root");
    expect(tree[0]?.children[0]?.label).toBe("child");
  });
});
