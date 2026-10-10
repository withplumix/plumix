// Resolves core's built `dist/`, so it checks published declarations.

import { describe, expectTypeOf, test } from "vitest";

import type { PluginRpcRouter } from "./plugin.js";

describe("plumix/plugin", () => {
  test("re-exports a router type that names procedures, not an open bag", () => {
    expectTypeOf<Record<string, unknown>>().not.toExtend<PluginRpcRouter>();
  });
});
