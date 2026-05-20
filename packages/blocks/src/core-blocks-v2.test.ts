import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "./block-registry.js";
import { coreBlocksV2 } from "./core-blocks-v2.js";

describe("coreBlocksV2", () => {
  test("includes the canonical typography and layout blocks the V2 corpus has migrated", () => {
    const names = new Set(coreBlocksV2.map((b) => b.name));
    expect(names.has("core/heading")).toBe(true);
    expect(names.has("core/paragraph")).toBe(true);
    expect(names.has("core/quote")).toBe(true);
    expect(names.has("core/code")).toBe(true);
    expect(names.has("core/group")).toBe(true);
    expect(names.has("core/columns")).toBe(true);
    expect(names.has("core/table")).toBe(true);
    expect(names.has("core/list")).toBe(true);
  });

  test("declares unique block names with no duplicates", () => {
    const names = coreBlocksV2.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("layout-category v2 blocks include the migrated wrappers + spacer", () => {
    const layoutNames = coreBlocksV2
      .filter((b) => b.category === "layout")
      .map((b) => b.name);
    expect(layoutNames).toEqual(
      expect.arrayContaining([
        "core/group",
        "core/columns",
        "core/details",
        "core/callout",
        "core/spacer",
      ]),
    );
  });

  test("interactive-category v2 blocks include button + buttons", () => {
    const interactiveNames = coreBlocksV2
      .filter((b) => b.category === "interactive")
      .map((b) => b.name);
    expect(interactiveNames).toEqual(
      expect.arrayContaining(["core/button", "core/buttons"]),
    );
  });

  test("text-category v2 blocks include the description-list family and table", () => {
    const textNames = coreBlocksV2
      .filter((b) => b.category === "text")
      .map((b) => b.name);
    expect(textNames).toEqual(
      expect.arrayContaining([
        "core/description-list",
        "core/description-term",
        "core/description-detail",
        "core/table",
      ]),
    );
  });

  test("seeds a BlockRegistry losslessly (size matches input length)", () => {
    const registry = createBlockRegistry(coreBlocksV2);
    expect(registry.size).toBe(coreBlocksV2.length);
    for (const spec of coreBlocksV2) {
      expect(registry.get(spec.name)).toBe(spec);
    }
  });

  test("does not include the html block (operators opt in explicitly)", () => {
    const names = new Set(coreBlocksV2.map((b) => b.name));
    expect(names.has("core/html")).toBe(false);
  });

  test("declares `inserter: false` on every spec that only makes sense inside a parent", () => {
    const contentOnlyNames = new Set([
      "core/table-header-row",
      "core/table-body-row",
      "core/table-header-cell",
      "core/table-cell",
      "core/list-item",
      "core/description-term",
      "core/description-detail",
    ]);

    for (const spec of coreBlocksV2) {
      if (contentOnlyNames.has(spec.name)) {
        expect(spec.inserter).toBe(false);
      } else {
        expect(spec.inserter).not.toBe(false);
      }
    }

    const hidden = new Set(
      coreBlocksV2.filter((s) => s.inserter === false).map((s) => s.name),
    );
    expect(hidden).toEqual(contentOnlyNames);
  });
});
