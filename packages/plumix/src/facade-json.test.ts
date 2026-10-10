// Resolves core's built `dist/`, so it checks published declarations. Type
// only: `pnpm typecheck` enforces it and the test run passes vacuously.

import { describe, expectTypeOf, test } from "vitest";

import type { JsonObject, JsonValue } from "./index.js";

describe("plumix umbrella", () => {
  test("re-exports the JSON value types from core", () => {
    expectTypeOf<JsonObject>().toExtend<JsonValue>();
  });
});
