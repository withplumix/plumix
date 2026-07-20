import { describe, expect, test } from "vitest";

import { fallback } from "./route/render/template-builders.js";
import { ThemeError } from "./theme-errors.js";
import { defineTheme } from "./theme.js";

const Stub = () => null;

describe("defineTheme tokens validation", () => {
  test("accepts valid tokens", () => {
    expect(() =>
      defineTheme({
        templates: [fallback(Stub)],
        tokens: {
          colors: { primary: { value: "#0066cc", label: "Primary" } },
          spacing: { md: { value: "1rem" } },
        },
      }),
    ).not.toThrow();
  });

  test("accepts a token entry with no value (label-only)", () => {
    expect(() =>
      defineTheme({
        templates: [fallback(Stub)],
        tokens: { colors: { brand: { label: "Brand" } } },
      }),
    ).not.toThrow();
  });

  test("rejects a slug with CSS-breaking characters", () => {
    expect(() =>
      defineTheme({
        templates: [fallback(Stub)],
        tokens: { colors: { "x } body": { value: "#fff" } } },
      }),
    ).toThrow(ThemeError);
  });

  test("rejects a slug starting with a digit", () => {
    expect(() =>
      defineTheme({
        templates: [fallback(Stub)],
        tokens: { colors: { "1bad": { value: "#fff" } } },
      }),
    ).toThrow(ThemeError);
  });

  test("rejects a value with `;` (declaration breakout)", () => {
    expect(() =>
      defineTheme({
        templates: [fallback(Stub)],
        tokens: {
          colors: { primary: { value: "#fff; } body { display:none" } },
        },
      }),
    ).toThrow(ThemeError);
  });

  test("rejects a value with `*/` (comment breakout)", () => {
    expect(() =>
      defineTheme({
        templates: [fallback(Stub)],
        tokens: {
          colors: { primary: { value: "#fff */ body { x: 1 } /*" } },
        },
      }),
    ).toThrow(ThemeError);
  });

  test("rejects a value with embedded newline", () => {
    expect(() =>
      defineTheme({
        templates: [fallback(Stub)],
        tokens: { colors: { primary: { value: "#fff\nbody { x: 1 }" } } },
      }),
    ).toThrow(ThemeError);
  });
});
