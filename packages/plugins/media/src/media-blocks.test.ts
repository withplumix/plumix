import { describe, expect, test } from "vitest";

import defaultBlocks, { mediaBlocks } from "./media-blocks.js";

describe("media-blocks", () => {
  // The `editorBlocksModule` contract: the default export is the block array
  // the plumix vite plugin imports into the generated editor entry.
  test("default export is the mediaBlocks array", () => {
    expect(defaultBlocks).toBe(mediaBlocks);
  });

  test("every spec is namespaced under media/", () => {
    for (const spec of mediaBlocks) {
      expect(spec.name.startsWith("media/")).toBe(true);
    }
  });
});
