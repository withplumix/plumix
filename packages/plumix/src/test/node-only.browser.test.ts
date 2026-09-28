import { expect, test } from "vitest";

import { createDispatcherHarness, createTestDb } from "./browser.js";

test("a Node-only export names itself and the tier its test belongs in", () => {
  expect(() => createTestDb()).toThrow(
    "createTestDb runs in Node — this test belongs in a `*.test.ts` file, " +
      "not `*.browser.test.tsx`.",
  );
  expect(() => createDispatcherHarness()).toThrow(/^createDispatcherHarness /);
});
