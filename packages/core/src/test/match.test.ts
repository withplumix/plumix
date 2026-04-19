import { describe, expect, test } from "vitest";

import { deepEqual, partialMatch } from "./match.js";

describe("deepEqual", () => {
  test("primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(NaN, NaN)).toBe(true); // Object.is
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  test("dates compare by timestamp, not identity", () => {
    const a = new Date("2020-01-01T00:00:00Z");
    const b = new Date("2020-01-01T00:00:00Z");
    expect(deepEqual(a, b)).toBe(true);
    expect(deepEqual(a, new Date("2020-01-02T00:00:00Z"))).toBe(false);
  });

  test("arrays", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(deepEqual([1, 2], { 0: 1, 1: 2, length: 2 })).toBe(false);
  });

  test("objects strict-equal on keys", () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  test("nested", () => {
    expect(
      deepEqual({ a: [1, { b: new Date(0) }] }, { a: [1, { b: new Date(0) }] }),
    ).toBe(true);
  });
});

describe("partialMatch", () => {
  test("actual may have extra keys", () => {
    expect(partialMatch({ a: 1, b: 2, c: 3 }, { a: 1 })).toBe(true);
    expect(partialMatch({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  test("arrays must match length and elements (not subset)", () => {
    expect(partialMatch([1, 2], [1, 2])).toBe(true);
    expect(partialMatch([1, 2, 3], [1, 2])).toBe(false);
  });

  test("nested partial match", () => {
    expect(
      partialMatch(
        { code: "NOT_FOUND", data: { kind: "post", id: 5, extra: true } },
        { code: "NOT_FOUND", data: { kind: "post", id: 5 } },
      ),
    ).toBe(true);
  });

  test("primitives use strict equality", () => {
    expect(partialMatch(1, 1)).toBe(true);
    expect(partialMatch(1, 2)).toBe(false);
    expect(partialMatch(null, null)).toBe(true);
    expect(partialMatch(undefined, undefined)).toBe(true);
  });
});
