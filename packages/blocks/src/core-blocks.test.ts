import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "./block-registry.js";
import { coreBlocks } from "./core-blocks.js";

describe("coreBlocks", () => {
  test("includes the canonical typography and layout blocks", () => {
    const names = new Set(coreBlocks.map((b) => b.name));
    expect(names.has("core/heading")).toBe(true);
    expect(names.has("core/paragraph")).toBe(true);
    expect(names.has("core/quote")).toBe(true);
    expect(names.has("core/code")).toBe(true);
    expect(names.has("core/group")).toBe(true);
    expect(names.has("core/columns")).toBe(true);
    expect(names.has("core/table")).toBe(true);
    expect(names.has("core/list")).toBe(true);
  });

  test("places core/rich-text immediately after core/paragraph so the inserter groups prose blocks together", () => {
    const names = coreBlocks.map((b) => b.name);
    expect(names[names.indexOf("core/paragraph") + 1]).toBe("core/rich-text");
  });

  test("declares unique block names with no duplicates", () => {
    const names = coreBlocks.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("layout-category blocks include the migrated wrappers + spacer", () => {
    const layoutNames = coreBlocks
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

  test("interactive-category blocks include button + buttons", () => {
    const interactiveNames = coreBlocks
      .filter((b) => b.category === "interactive")
      .map((b) => b.name);
    expect(interactiveNames).toEqual(
      expect.arrayContaining(["core/button", "core/buttons"]),
    );
  });

  test("text-category blocks include the description-list family and table", () => {
    const textNames = coreBlocks
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
    const registry = createBlockRegistry(coreBlocks);
    expect(registry.size).toBe(coreBlocks.length);
    for (const spec of coreBlocks) {
      expect(registry.get(spec.name)).toBe(spec);
    }
  });

  test("does not include the html block (operators opt in explicitly)", () => {
    const names = new Set(coreBlocks.map((b) => b.name));
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

    for (const spec of coreBlocks) {
      if (contentOnlyNames.has(spec.name)) {
        expect(spec.inserter).toBe(false);
      } else {
        expect(spec.inserter).not.toBe(false);
      }
    }

    const hidden = new Set(
      coreBlocks.filter((s) => s.inserter === false).map((s) => s.name),
    );
    expect(hidden).toEqual(contentOnlyNames);
  });
});
