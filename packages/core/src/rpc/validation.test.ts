import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { idParam, idPathParam } from "./validation.js";

describe("idParam", () => {
  test("accepts positive integers", () => {
    expect(v.parse(idParam, 1)).toBe(1);
    expect(v.parse(idParam, 42)).toBe(42);
    expect(v.parse(idParam, 999_999)).toBe(999_999);
  });

  test("rejects zero, negatives, floats, and NaN", () => {
    expect(() => v.parse(idParam, 0)).toThrow();
    expect(() => v.parse(idParam, -1)).toThrow();
    expect(() => v.parse(idParam, 1.5)).toThrow();
    expect(() => v.parse(idParam, Number.NaN)).toThrow();
    expect(() => v.parse(idParam, Infinity)).toThrow();
  });

  test("rejects unsafe-integer-valued numbers (precision loss risk)", () => {
    // 1e21 passes v.integer() because the number IS integer-valued,
    // but it's beyond MAX_SAFE_INTEGER and loses precision in cache
    // keys / SQLite row-id comparisons.
    expect(() => v.parse(idParam, 1e21)).toThrow();
    expect(() => v.parse(idParam, Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  test("rejects non-numbers", () => {
    expect(() => v.parse(idParam, "1")).toThrow();
    expect(() => v.parse(idParam, null)).toThrow();
    expect(() => v.parse(idParam, undefined)).toThrow();
  });
});

describe("idPathParam", () => {
  test("coerces numeric strings to positive integers", () => {
    expect(v.parse(idPathParam, "1")).toBe(1);
    expect(v.parse(idPathParam, "42")).toBe(42);
  });

  test("rejects non-numeric strings", () => {
    expect(() => v.parse(idPathParam, "abc")).toThrow();
    expect(() => v.parse(idPathParam, "")).toThrow();
    expect(() => v.parse(idPathParam, "1.5")).toThrow();
  });

  test("rejects zero and negatives even when parseable", () => {
    expect(() => v.parse(idPathParam, "0")).toThrow();
    expect(() => v.parse(idPathParam, "-5")).toThrow();
  });

  test("rejects unicode-digit strings (ASCII-only by design)", () => {
    // Some browsers encode `〡` / `١` / `１` intact in URLs; the ASCII-
    // only `/^[1-9]\d*$/` rejects them so the schema stays portable
    // and unambiguous across locales.
    expect(() => v.parse(idPathParam, "１")).toThrow();
    expect(() => v.parse(idPathParam, "١")).toThrow();
  });

  test("rejects null bytes and digit runs that exceed MAX_SAFE_INTEGER", () => {
    expect(() => v.parse(idPathParam, "1\0")).toThrow();
    // Regex passes, but the coerced number loses precision beyond
    // MAX_SAFE_INTEGER — idParam's maxValue check catches this.
    expect(() => v.parse(idPathParam, "9".repeat(20))).toThrow();
  });

  test("rejects Number() coercion quirks that would otherwise pass", () => {
    // `Number()` coerces these to valid integers (0x1F→31, 5e2→500,
    // +5→5, " 42 "→42). The regex gate in `idPathParam` rejects
    // them up front so the route surfaces a clean 404 instead of
    // firing an RPC with a surprising id.
    expect(() => v.parse(idPathParam, "0x1F")).toThrow();
    expect(() => v.parse(idPathParam, "5e2")).toThrow();
    expect(() => v.parse(idPathParam, "+5")).toThrow();
    expect(() => v.parse(idPathParam, " 42 ")).toThrow();
    expect(() => v.parse(idPathParam, "01")).toThrow();
    expect(() => v.parse(idPathParam, "1\n")).toThrow();
  });

  test("rejects non-strings — URL params are always strings", () => {
    expect(() => v.parse(idPathParam, 1)).toThrow();
    expect(() => v.parse(idPathParam, null)).toThrow();
  });
});
