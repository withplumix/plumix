import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/core/blocks";

import { treeBlocks } from "../test/tree-blocks.js";
import { jsonForScope } from "./json-scope.js";

const TREE: readonly BlockNode[] = [
  { id: "a", name: "core/heading", attrs: { text: "Hi" } },
  { id: "b", name: "core/heading", attrs: { text: "There" } },
];

describe("jsonForScope", () => {
  test("the page scope shows the whole tree", () => {
    expect(
      JSON.parse(jsonForScope(treeBlocks, TREE, "a", "page") ?? ""),
    ).toEqual(TREE);
  });

  test("the block scope shows only the selected block", () => {
    expect(
      JSON.parse(jsonForScope(treeBlocks, TREE, "b", "block") ?? ""),
    ).toEqual({ id: "b", name: "core/heading", attrs: { text: "There" } });
  });

  test("the block scope has nothing to show when no block is selected", () => {
    expect(jsonForScope(treeBlocks, TREE, null, "block")).toBeNull();
  });
});
