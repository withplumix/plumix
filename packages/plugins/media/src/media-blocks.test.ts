import { describe, expect, test } from "vitest";

import { mediaBlocks } from "./media-blocks.js";

describe("media-blocks", () => {
  test("every spec is namespaced under media/", () => {
    for (const spec of mediaBlocks) {
      expect(spec.name.startsWith("media/")).toBe(true);
    }
  });
});
