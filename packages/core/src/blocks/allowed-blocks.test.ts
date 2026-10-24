import { describe, expect, test } from "vitest";

import type { BlockSpec } from "./block-registry.js";
import { resolveAllowedBlocks } from "./allowed-blocks.js";
import { createBlockRegistry } from "./block-registry.js";
import { coreBlocks } from "./core-blocks.js";

const formBlock: BlockSpec = { name: "forms/form", render: () => null };
const heroBlock: BlockSpec = { name: "acme/hero", render: () => null };
const registry = createBlockRegistry([...coreBlocks, formBlock, heroBlock]);
const themeBlocks = [heroBlock];

describe("resolveAllowedBlocks", () => {
  test("allows every registered block when the theme lists none", () => {
    expect(resolveAllowedBlocks(registry, { themeBlocks })).toEqual(
      [...registry].map((spec) => spec.name),
    );
  });

  test("allows a listed block's slot-bound children with it", () => {
    const allowed = resolveAllowedBlocks(registry, {
      themeBlocks: [],
      allowedBlocks: ["core/columns", "core/table"],
    });

    expect([...allowed].sort()).toEqual(
      [
        "core/columns",
        "core/column",
        "core/table",
        "core/table-header-row",
        "core/table-body-row",
        "core/table-header-cell",
        "core/table-cell",
      ].sort(),
    );
  });

  test("leaves out a plugin block the list doesn't name", () => {
    const allowed = resolveAllowedBlocks(registry, {
      themeBlocks,
      allowedBlocks: ["core/rich-text"],
    });

    expect(allowed).not.toContain("forms/form");
  });

  test("ignores a name no one registers", () => {
    const allowed = resolveAllowedBlocks(registry, {
      themeBlocks: [],
      allowedBlocks: ["core/rich-text", "acme/missing"],
    });

    expect(allowed).toEqual(["core/rich-text"]);
  });

  test("always allows the theme's own blocks", () => {
    const allowed = resolveAllowedBlocks(registry, {
      themeBlocks,
      allowedBlocks: ["core/rich-text"],
    });

    expect([...allowed].sort()).toEqual(["acme/hero", "core/rich-text"]);
  });

  test("ignores a slot-bound child named without its parent", () => {
    const allowed = resolveAllowedBlocks(registry, {
      themeBlocks: [],
      allowedBlocks: ["core/column", "core/table-cell"],
    });

    expect(allowed).toEqual([]);
  });
});
