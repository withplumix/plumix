import { describe, expect, test } from "vitest";

import { assembleThread } from "./thread.js";

describe("assembleThread", () => {
  test("returns an empty list for no input", () => {
    expect(assembleThread([])).toEqual([]);
  });

  test("top-level comments become roots in input order", () => {
    const tree = assembleThread([
      { id: 1, parentId: null, value: "a" },
      { id: 2, parentId: null, value: "b" },
    ]);
    expect(tree.map((n) => n.value)).toEqual(["a", "b"]);
    expect(tree.every((n) => n.replies.length === 0)).toBe(true);
  });

  test("nests a reply under its parent", () => {
    const tree = assembleThread([
      { id: 1, parentId: null, value: "root" },
      { id: 2, parentId: 1, value: "reply" },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.value).toBe("root");
    expect(tree[0]?.replies.map((n) => n.value)).toEqual(["reply"]);
  });

  test("nests multiple levels", () => {
    const tree = assembleThread([
      { id: 1, parentId: null, value: "r" },
      { id: 2, parentId: 1, value: "c1" },
      { id: 3, parentId: 2, value: "c2" },
    ]);
    expect(tree[0]?.replies[0]?.replies[0]?.value).toBe("c2");
  });

  test("preserves sibling order within a parent", () => {
    const tree = assembleThread([
      { id: 1, parentId: null, value: "r" },
      { id: 2, parentId: 1, value: "first" },
      { id: 3, parentId: 1, value: "second" },
    ]);
    expect(tree[0]?.replies.map((n) => n.value)).toEqual(["first", "second"]);
  });

  test("promotes an orphan (parent absent) to a root", () => {
    // Parent is hidden (e.g. pending/spam) so it isn't in the set; the
    // approved reply still surfaces rather than vanishing.
    const tree = assembleThread([{ id: 2, parentId: 1, value: "orphan" }]);
    expect(tree.map((n) => n.value)).toEqual(["orphan"]);
  });
});
