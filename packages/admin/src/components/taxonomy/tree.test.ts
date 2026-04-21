import { describe, expect, test } from "vitest";

import type { Term } from "@plumix/core/schema";

import {
  buildTermTree,
  descendantIds,
  flattenTree,
  parentPickerOptions,
} from "./tree.js";

function term(overrides: Partial<Term> & { id: number; name: string }): Term {
  return {
    taxonomy: "category",
    slug: overrides.name.toLowerCase().replaceAll(" ", "-"),
    description: null,
    parentId: null,
    meta: {},
    ...overrides,
  };
}

describe("buildTermTree", () => {
  test("empty input yields an empty forest", () => {
    expect(buildTermTree([])).toEqual([]);
  });

  test("roots are terms with null parentId", () => {
    const tree = buildTermTree([
      term({ id: 1, name: "Food" }),
      term({ id: 2, name: "Drink" }),
    ]);
    expect(tree.map((n) => n.term.id)).toEqual([2, 1]); // alpha: Drink, Food
    expect(tree[0]?.children).toEqual([]);
  });

  test("sorts siblings alphabetically (matches server ORDER BY name)", () => {
    const tree = buildTermTree([
      term({ id: 1, name: "Zeta" }),
      term({ id: 2, name: "Alpha" }),
      term({ id: 3, name: "Mu" }),
    ]);
    expect(tree.map((n) => n.term.name)).toEqual(["Alpha", "Mu", "Zeta"]);
  });

  test("nests children under their parent", () => {
    const tree = buildTermTree([
      term({ id: 1, name: "Food" }),
      term({ id: 2, name: "Fruit", parentId: 1 }),
      term({ id: 3, name: "Apple", parentId: 2 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.term.name).toBe("Food");
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.term.name).toBe("Fruit");
    expect(tree[0]?.children[0]?.children[0]?.term.name).toBe("Apple");
  });

  test("orphan promotion: parentId pointing outside the set → rendered at root", () => {
    // Real-world cause: a taxonomy with >200 terms where the edit-page
    // siblings query paginates out a term's actual parent. Better to
    // still render the orphan at root than drop it silently.
    const tree = buildTermTree([
      term({ id: 5, name: "Orphan", parentId: 999 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.term.id).toBe(5);
  });
});

describe("flattenTree", () => {
  test("DFS preserves tree order and carries depth", () => {
    const tree = buildTermTree([
      term({ id: 1, name: "Food" }),
      term({ id: 2, name: "Fruit", parentId: 1 }),
      term({ id: 3, name: "Apple", parentId: 2 }),
      term({ id: 4, name: "Vegetable", parentId: 1 }),
    ]);
    const flat = flattenTree(tree);
    expect(flat.map((n) => [n.term.name, n.depth])).toEqual([
      ["Food", 0],
      ["Fruit", 1],
      ["Apple", 2],
      ["Vegetable", 1],
    ]);
  });
});

describe("descendantIds", () => {
  test("includes the root itself plus every descendant", () => {
    const terms: Term[] = [
      term({ id: 1, name: "Food" }),
      term({ id: 2, name: "Fruit", parentId: 1 }),
      term({ id: 3, name: "Apple", parentId: 2 }),
      term({ id: 4, name: "Vegetable", parentId: 1 }),
    ];
    expect([...descendantIds(terms, 1)].sort()).toEqual([1, 2, 3, 4]);
    expect([...descendantIds(terms, 2)].sort()).toEqual([2, 3]);
    expect([...descendantIds(terms, 3)].sort()).toEqual([3]);
  });

  test("rootId not in the tree → empty set (caller must backstop)", () => {
    // This is the gap the `$id.tsx` edit route works around by
    // always seeding `excludeIds` with the term's own id. This test
    // locks in the `descendantIds` behaviour so a future "helpful"
    // refactor doesn't quietly change the contract.
    const terms: Term[] = [term({ id: 1, name: "Food" })];
    expect(descendantIds(terms, 999)).toEqual(new Set());
  });

  test("empty input is safe", () => {
    expect(descendantIds([], 1)).toEqual(new Set());
  });
});

describe("parentPickerOptions", () => {
  test("returns all terms with depth-prefixed labels", () => {
    const terms: Term[] = [
      term({ id: 1, name: "Food" }),
      term({ id: 2, name: "Fruit", parentId: 1 }),
      term({ id: 3, name: "Apple", parentId: 2 }),
    ];
    expect(parentPickerOptions(terms)).toEqual([
      { id: 1, label: "Food" },
      { id: 2, label: "— Fruit" },
      { id: 3, label: "— — Apple" },
    ]);
  });

  test("respects the exclude set (self + descendants for cycle prevention)", () => {
    const terms: Term[] = [
      term({ id: 1, name: "Food" }),
      term({ id: 2, name: "Fruit", parentId: 1 }),
      term({ id: 3, name: "Apple", parentId: 2 }),
      term({ id: 4, name: "Vegetable", parentId: 1 }),
    ];
    // Editing "Fruit" (id=2): exclude itself + Apple (descendant) so
    // the picker can't suggest a parent change that creates a cycle.
    const exclude = new Set([2, 3]);
    const ids = parentPickerOptions(terms, exclude).map((o) => o.id);
    expect(ids).toEqual([1, 4]);
  });
});
