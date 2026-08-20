// Reachability guard for the JSON value types (#1811): a plugin author must
// reach them through the public umbrella, never by importing @plumix/core.
//
// This package has no tsconfig `paths`, so `@plumix/core` resolves through the
// workspace link to its built `dist/` — which makes this an assertion about
// core's *published* declarations, not its source. Type-only, so `pnpm
// typecheck` is what enforces it; the test run passes vacuously.

import { describe, expectTypeOf, test } from "vitest";

import type { JsonObject, JsonValue } from "./index.js";

describe("plumix umbrella", () => {
  test("re-exports the JSON value types from core", () => {
    expectTypeOf<JsonObject>().toExtend<JsonValue>();
  });
});
