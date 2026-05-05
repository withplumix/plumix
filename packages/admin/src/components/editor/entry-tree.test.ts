import { describe, expect, test } from "vitest";

import type { Entry } from "@plumix/core/schema";

import {
  buildEntryTree,
  descendantIds,
  flattenTree,
  parentPickerOptions,
} from "./entry-tree.js";

function entry(
  overrides: Partial<Entry> & { id: number; title: string },
): Entry {
  const now = new Date(0);
  return {
    type: "page",
    parentId: null,
    slug: overrides.title.toLowerCase().replaceAll(" ", "-"),
    content: null,
    excerpt: null,
    status: "published",
    authorId: 1,
    sortOrder: 0,
    meta: {},
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("buildEntryTree", () => {
  test("empty input yields an empty forest", () => {
    expect(buildEntryTree([])).toEqual([]);
  });

  test("roots are entries with null parentId, sorted by title", () => {
    const tree = buildEntryTree([
      entry({ id: 1, title: "About" }),
      entry({ id: 2, title: "Contact" }),
    ]);
    expect(tree.map((n) => n.entry.title)).toEqual(["About", "Contact"]);
  });

  test("nests children under their parent", () => {
    const tree = buildEntryTree([
      entry({ id: 1, title: "About" }),
      entry({ id: 2, title: "Team", parentId: 1 }),
      entry({ id: 3, title: "Eng", parentId: 2 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.entry.title).toBe("About");
    expect(tree[0]?.children[0]?.entry.title).toBe("Team");
    expect(tree[0]?.children[0]?.children[0]?.entry.title).toBe("Eng");
  });

  test("orphan promotion: parentId pointing outside the set → rendered at root", () => {
    const tree = buildEntryTree([
      entry({ id: 5, title: "Orphan", parentId: 999 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.entry.id).toBe(5);
  });

  test("untitled entries don't crash and still appear in the tree", () => {
    const tree = buildEntryTree([
      entry({ id: 1, title: "" }),
      entry({ id: 2, title: "About" }),
    ]);
    expect(tree).toHaveLength(2);
    expect(tree.map((n) => n.entry.id).sort()).toEqual([1, 2]);
  });
});

describe("flattenTree", () => {
  test("DFS preserves order and carries depth", () => {
    const tree = buildEntryTree([
      entry({ id: 1, title: "About" }),
      entry({ id: 2, title: "Team", parentId: 1 }),
      entry({ id: 3, title: "Eng", parentId: 2 }),
      entry({ id: 4, title: "Press", parentId: 1 }),
    ]);
    const flat = flattenTree(tree);
    expect(flat.map((n) => [n.entry.title, n.depth])).toEqual([
      ["About", 0],
      ["Press", 1],
      ["Team", 1],
      ["Eng", 2],
    ]);
  });
});

describe("descendantIds", () => {
  test("includes the root itself plus every descendant", () => {
    const entries: Entry[] = [
      entry({ id: 1, title: "About" }),
      entry({ id: 2, title: "Team", parentId: 1 }),
      entry({ id: 3, title: "Eng", parentId: 2 }),
      entry({ id: 4, title: "Press", parentId: 1 }),
    ];
    expect([...descendantIds(entries, 1)].sort()).toEqual([1, 2, 3, 4]);
    expect([...descendantIds(entries, 2)].sort()).toEqual([2, 3]);
    expect([...descendantIds(entries, 3)].sort()).toEqual([3]);
  });

  test("rootId not in the tree → empty set (caller must backstop with self id)", () => {
    expect(descendantIds([entry({ id: 1, title: "About" })], 999)).toEqual(
      new Set(),
    );
  });

  test("empty input is safe", () => {
    expect(descendantIds([], 1)).toEqual(new Set());
  });
});

describe("parentPickerOptions", () => {
  test("returns all entries with depth-prefixed labels", () => {
    const entries: Entry[] = [
      entry({ id: 1, title: "About" }),
      entry({ id: 2, title: "Team", parentId: 1 }),
      entry({ id: 3, title: "Eng", parentId: 2 }),
    ];
    expect(parentPickerOptions(entries)).toEqual([
      { id: 1, label: "About" },
      { id: 2, label: "— Team" },
      { id: 3, label: "— — Eng" },
    ]);
  });

  test("respects the exclude set (self + descendants for cycle prevention)", () => {
    const entries: Entry[] = [
      entry({ id: 1, title: "About" }),
      entry({ id: 2, title: "Team", parentId: 1 }),
      entry({ id: 3, title: "Eng", parentId: 2 }),
      entry({ id: 4, title: "Press", parentId: 1 }),
    ];
    const ids = parentPickerOptions(entries, new Set([2, 3])).map((o) => o.id);
    expect(ids).toEqual([1, 4]);
  });

  test("falls back to a placeholder label when the title is empty", () => {
    const entries: Entry[] = [entry({ id: 1, title: "" })];
    expect(parentPickerOptions(entries)).toEqual([
      { id: 1, label: "(no title)" },
    ]);
  });
});
