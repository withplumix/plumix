// Reachability guard for the plugin RPC router type (#1896): a plugin names
// the shape it hands `registerRpcRouter` through the public umbrella, never by
// importing @plumix/core. Resolves through core's built `dist/`, like the JSON
// guard next door, so this asserts core's *published* declarations — a
// regression back to a dictionary of `any` fails here.

import { describe, expectTypeOf, test } from "vitest";

import type { PluginRpcRouter } from "./plugin.js";

describe("plumix/plugin", () => {
  test("re-exports a router type that names procedures, not an open bag", () => {
    expectTypeOf<Record<string, unknown>>().not.toExtend<PluginRpcRouter>();
  });
});
