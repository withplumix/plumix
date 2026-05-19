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
});
