// Reachability guard for core's RPC lifecycle actions (#2308): a plugin
// listens for `entry:*`/`term:*`/etc. through `ctx.addAction` on the public
// umbrella, never by importing @plumix/core. `rpc/hooks.ts` augments
// `ActionRegistry` from a module that must be anchored into the published
// declaration graph (see `public-hooks.ts`) or the augmentation never reaches
// a consumer and `ActionName` collapses to `never`, forcing plugin authors to
// cast the name `as never` at the call site.
//
// No `tsconfig` paths here, so `@plumix/core` resolves through the built
// `dist/`, making this a check on core's *published* types; enforcement is at
// `pnpm typecheck`, not the vitest run.

import { describe, expectTypeOf, test } from "vitest";

import type { PluginSetupContext } from "./plugin.js";

describe("plumix/plugin", () => {
  test("carries the RPC lifecycle action names, not `never`", () => {
    expectTypeOf<"entry:published">().toExtend<
      Parameters<PluginSetupContext["addAction"]>[0]
    >();
  });
});
