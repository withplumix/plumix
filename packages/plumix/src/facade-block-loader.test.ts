import { describe, expectTypeOf, test } from "vitest";

import type { BlockLoaderArgs } from "./blocks/index.js";
import type { AppContext } from "./plugin.js";

// Core's `blocks/` sits below `context/` and cannot name `AppContext`, so the
// `plumix/blocks` façade fills the loader-context seam.
describe("plumix/blocks loader context", () => {
  test("a loader reads ctx as the request's AppContext", () => {
    expectTypeOf<BlockLoaderArgs["ctx"]>().toEqualTypeOf<AppContext>();
  });
});
