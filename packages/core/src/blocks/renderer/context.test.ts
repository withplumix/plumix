import { describe, expectTypeOf, test } from "vitest";

import type { AuthMethodsSummary } from "../../auth/contract/auth-methods.js";
import type { AuthenticatedUser } from "../../context/app-context.js";
import type { RendererOAuthProvider, RendererUser } from "./context.js";

describe("renderer context types", () => {
  test("a user's meta is the authenticated user's meta", () => {
    expectTypeOf<RendererUser["meta"]>().toEqualTypeOf<
      AuthenticatedUser["meta"]
    >();
  });

  test("an OAuth provider is an auth-methods summary's provider", () => {
    expectTypeOf<RendererOAuthProvider>().toEqualTypeOf<
      AuthMethodsSummary["oauth"][number]
    >();
  });
});
