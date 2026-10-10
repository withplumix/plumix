import { expect, test } from "vitest";

import * as browserBuild from "./browser.js";
import * as nodeBuild from "./index.js";

// Both builds share the Node build's declarations, so a name only one exports
// would typecheck where it is missing.
test("the Node and browser builds export the same names", () => {
  expect(Object.keys(browserBuild).sort()).toEqual(
    Object.keys(nodeBuild).sort(),
  );
});
