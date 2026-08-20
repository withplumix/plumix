// Type-level test: these types have no runtime, so the assertions cover only
// what a reader can't get from the union's own text — recursion, and the two
// shapes that look assignable but aren't.

import { describe, expectTypeOf, test } from "vitest";

import type { JsonObject, JsonValue } from "./json.js";

interface NamedMeta {
  readonly title: string;
}

describe("JsonValue", () => {
  test("recurses through nested objects and arrays", () => {
    expectTypeOf<{ a: { b: readonly number[] } }>().toExtend<JsonValue>();
  });

  test("rejects a dictionary of unknown — the pattern it replaces", () => {
    expectTypeOf<Record<string, unknown>>().not.toExtend<JsonValue>();
  });
});

describe("JsonObject", () => {
  test("admits an object type, which carries an implicit index signature", () => {
    expectTypeOf<{ a: 1; b: "two" }>().toExtend<JsonObject>();
  });

  test("rejects a named interface, which does not", () => {
    expectTypeOf<NamedMeta>().not.toExtend<JsonObject>();
  });
});
