import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { createBlockRegistry, defineBlock } from "./block-registry.js";
import { findBlockNode } from "./find-block-node.js";
import { groupBlock } from "./group/index.js";

const blocks = createBlockRegistry([
  groupBlock,
  defineBlock({ name: "acme/team", render: () => null }),
]);

const tree: readonly BlockNode[] = [
  { id: "a", name: "core/x" },
  {
    id: "g",
    name: "core/group",
    attrs: { content: [{ id: "c", name: "core/y" }] },
  },
  {
    id: "t",
    name: "acme/team",
    attrs: { members: [], people: [{ id: "1", name: "Alice" }] },
  },
  {
    id: "u",
    name: "acme/missing",
    attrs: { content: [{ id: "hidden", name: "core/y" }] },
  },
];

describe("findBlockNode", () => {
  test("finds a top-level node by id", () => {
    expect(findBlockNode(tree, "a", blocks)?.name).toBe("core/x");
  });

  test("finds a node nested in a slot attr", () => {
    expect(findBlockNode(tree, "c", blocks)?.name).toBe("core/y");
  });

  test("returns null when the id is absent", () => {
    expect(findBlockNode(tree, "nope", blocks)).toBeNull();
  });

  test("does not reach an item of a data array no slot declares", () => {
    expect(findBlockNode(tree, "1", blocks)).toBeNull();
  });

  test("does not reach into an unregistered block's children", () => {
    expect(findBlockNode(tree, "hidden", blocks)).toBeNull();
  });
});
