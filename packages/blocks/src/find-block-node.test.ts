import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { findBlockNode } from "./find-block-node.js";

const tree: readonly BlockNode[] = [
  { id: "a", name: "core/x" },
  {
    id: "g",
    name: "core/group",
    attrs: { content: [{ id: "c", name: "core/y" }] },
  },
];

describe("findBlockNode", () => {
  test("finds a top-level node by id", () => {
    expect(findBlockNode(tree, "a")?.name).toBe("core/x");
  });

  test("finds a node nested in a slot attr", () => {
    expect(findBlockNode(tree, "c")?.name).toBe("core/y");
  });

  test("returns null when the id is absent", () => {
    expect(findBlockNode(tree, "nope")).toBeNull();
  });
});
