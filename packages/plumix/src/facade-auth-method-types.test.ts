import { describe, expectTypeOf, test } from "vitest";

import type {
  AuthMethodDefinition,
  AuthMethodKernel,
  IdentityRefusalCode,
  PluginDescriptor,
} from "./plugin.js";
import { defineAuthMethod } from "./plugin.js";

// A plugin names the types of what it writes: its descriptor's `authMethods`
// and the kernel its handlers receive, from the subpath a plugin imports.
describe("plumix/plugin sign-in method types", () => {
  test("names the descriptor's `authMethods`", () => {
    expectTypeOf<PluginDescriptor["authMethods"]>().toEqualTypeOf<
      readonly AuthMethodDefinition[] | undefined
    >();
  });

  test("types `fail` by the declared codes and the identity refusals", () => {
    const method = defineAuthMethod({
      name: "fixture",
      label: "Fixture",
      errorCodes: ["code_expired"],
      routes: {
        start: { method: "POST", handler: (auth) => auth.fail("code_expired") },
      },
    });

    expectTypeOf(method).toEqualTypeOf<AuthMethodDefinition<"code_expired">>();
    expectTypeOf<
      Parameters<AuthMethodKernel<"code_expired">["fail"]>[0]
    >().toEqualTypeOf<"code_expired" | IdentityRefusalCode>();
  });
});
