import { expect, test } from "vitest";

import * as browserBuild from "./browser.js";
import * as nodeBuild from "./index.js";

// `plumix/test` resolves to one of two builds by the `browser` condition, and
// both are typed by the Node build's declarations. A name only one of them
// exports would typecheck in the tier that lacks it and fail on import.
test("the Node and browser builds export the same names", () => {
  expect(Object.keys(browserBuild).sort()).toEqual(
    Object.keys(nodeBuild).sort(),
  );
});
