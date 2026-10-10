// Unless the augmenting module is anchored into the published declarations,
// `ActionName` collapses to `never`. Resolves core's built `dist/`, so
// `pnpm typecheck` enforces it.

import { describe, expectTypeOf, test } from "vitest";

import type { PluginSetupContext } from "./plugin.js";

describe("plumix/plugin", () => {
  test("carries the RPC lifecycle action names, not `never`", () => {
    expectTypeOf<"entry:published">().toExtend<
      Parameters<PluginSetupContext["addAction"]>[0]
    >();
  });
});
