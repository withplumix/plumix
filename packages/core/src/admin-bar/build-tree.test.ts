import { describe, expect, test } from "vitest";

import type { AdminBarNode } from "./types.js";
import { buildAdminBarTree } from "./build-tree.js";

function node(id: string, fields: Partial<AdminBarNode> = {}): AdminBarNode {
  return {
    id,
    title: id,
    group: "primary",
    ...fields,
  };
}

describe("buildAdminBarTree", () => {
  test("returns empty array for empty input", () => {
    expect(buildAdminBarTree([])).toEqual([]);
  });

  test("sorts siblings by position ascending (lower first)", () => {
    const tree = buildAdminBarTree([
      node("b", { position: 20 }),
      node("a", { position: 10 }),
      node("c", { position: 30 }),
    ]);

    expect(tree.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  test("stable tie-break on equal positions follows insertion order", () => {
    const tree = buildAdminBarTree([
      node("a", { position: 10 }),
      node("b", { position: 10 }),
      node("c", { position: 10 }),
    ]);

    expect(tree.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  test("nodes without position sort after positioned nodes", () => {
    const tree = buildAdminBarTree([node("z"), node("a", { position: 10 })]);

    expect(tree.map((n) => n.id)).toEqual(["a", "z"]);
  });

  test("groups children under their parent", () => {
    const tree = buildAdminBarTree([
      node("root1", { position: 10 }),
      node("child1", { parent: "root1", position: 10 }),
      node("child2", { parent: "root1", position: 20 }),
      node("root2", { position: 20 }),
    ]);

    const [root1, root2] = tree;
    if (!root1 || !root2) throw new Error("expected two root nodes");

    expect(tree.map((n) => n.id)).toEqual(["root1", "root2"]);
    expect(root1.children.map((n) => n.id)).toEqual(["child1", "child2"]);
    expect(root2.children).toEqual([]);
  });

  test("re-parents orphan nodes (parent id unknown) to root", () => {
    const tree = buildAdminBarTree([
      node("root", { position: 10 }),
      node("orphan", { parent: "missing", position: 20 }),
    ]);

    expect(tree.map((n) => n.id)).toEqual(["root", "orphan"]);
  });
});
