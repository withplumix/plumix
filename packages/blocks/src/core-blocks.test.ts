import { describe, expect, test } from "vitest";

import { coreBlocks } from "./core-blocks.js";

describe("coreBlocks catalogue", () => {
  test("ships layout primitives alongside paragraph", () => {
    const names = coreBlocks.map((b) => b.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "core/paragraph",
        "core/group",
        "core/columns",
        "core/column",
      ]),
    );
  });

  test("ships the list family", () => {
    const names = coreBlocks.map((b) => b.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "core/list",
        "core/list-ordered",
        "core/list-item",
      ]),
    );
  });

  test("layout blocks declare the `layout` category", () => {
    const layoutBlocks = coreBlocks.filter((b) => b.category === "layout");
    const names = layoutBlocks.map((b) => b.name);
    expect(names).toEqual(
      expect.arrayContaining(["core/group", "core/columns", "core/column"]),
    );
  });
});
