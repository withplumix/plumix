// Type-level test: these types have no runtime, so the assertions cover only
// what a reader can't get from the declarations' own text — recursion, the
// shapes that look assignable but aren't, and the two halves of the block tree.
// Enforced by `tsc`, not by the vitest run.

import { describe, expectTypeOf, test } from "vitest";

import type { JsonObject, JsonValue } from "./json.js";
import type { BlockNode, MaterializedAttrs } from "./render-block-tree.js";

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

// Guards the respell: an interface anywhere in a node's reach breaks the first
// assertion, including `ResponsiveStyleSlot` and `VisibilityFlags`.
describe("the stored block tree", () => {
  test("is JSON, so a slot attr can hold its own children", () => {
    expectTypeOf<readonly BlockNode[]>().toExtend<JsonValue>();
  });

  test("stays open once materialized, so a slot can hold a component", () => {
    expectTypeOf<MaterializedAttrs>().not.toExtend<JsonObject>();
  });
});
