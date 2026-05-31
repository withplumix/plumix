import { describe, expect, test } from "vitest";

import { createBlockRegistry, defineBlock } from "./block-registry.js";
import { resolveBlockScopeVariations } from "./block-scope-variations.js";

describe("resolveBlockScopeVariations", () => {
  test("returns an empty list when the block declares no variations", () => {
    const blocks = createBlockRegistry([
      defineBlock({ name: "core/spacer", title: "Spacer", render: () => null }),
    ]);
    expect(resolveBlockScopeVariations(blocks, "core/spacer")).toEqual([]);
  });

  test("returns only variations whose scope includes 'block'", () => {
    const blocks = createBlockRegistry([
      defineBlock({
        name: "core/columns",
        title: "Columns",
        render: () => null,
        variations: [
          {
            slug: "two-up",
            title: "Two up",
            attrs: { layout: "split" },
            scope: ["block"],
          },
          {
            slug: "three-up",
            title: "Three up",
            attrs: { layout: "three" },
            scope: ["block"],
          },
          {
            slug: "rare",
            title: "Rare",
            attrs: { layout: "rare" },
            scope: ["inserter"],
          },
        ],
      }),
    ]);
    const list = resolveBlockScopeVariations(blocks, "core/columns");
    expect(list.map((v) => v.slug)).toEqual(["two-up", "three-up"]);
  });

  test("respects capability gating — skips variations whose parent block's capability the user lacks", () => {
    const blocks = createBlockRegistry([
      defineBlock({
        name: "core/restricted",
        title: "Restricted",
        capability: "publish:posts",
        render: () => null,
        variations: [
          {
            slug: "restricted-variation",
            title: "Restricted variation",
            attrs: { layout: "x" },
            scope: ["block"],
          },
        ],
      }),
    ]);
    expect(
      resolveBlockScopeVariations(blocks, "core/restricted", new Set()),
    ).toEqual([]);
    expect(
      resolveBlockScopeVariations(
        blocks,
        "core/restricted",
        new Set(["publish:posts"]),
      ),
    ).toHaveLength(1);
  });
});
