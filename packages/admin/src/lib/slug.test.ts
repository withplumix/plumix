import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { SLUG_MAX_LENGTH } from "@plumix/core/validation";

import { slugField } from "./slug.js";

const accepts = (input: string): boolean =>
  v.safeParse(slugField, input).success;

describe("slugField", () => {
  test("accepts kebab-case ASCII slugs", () => {
    for (const ok of ["a", "jane-doe", "user-1", "a1-b2-c3"]) {
      expect(accepts(ok)).toBe(true);
    }
  });

  test("rejects empty, uppercase, spaces, and malformed dashes", () => {
    for (const bad of ["", "Jane", "a b", "-a", "a-", "a--b", "café"]) {
      expect(accepts(bad)).toBe(false);
    }
  });

  test("trims surrounding whitespace before validating", () => {
    const result = v.safeParse(slugField, "  jane-doe  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.output).toBe("jane-doe");
  });

  test("enforces the core-shared max length (drift guard)", () => {
    // Bound is imported from core so a client-valid slug can't exceed what
    // the server `slugSchema` accepts — the whole point of the shared field.
    expect(accepts("a".repeat(SLUG_MAX_LENGTH))).toBe(true);
    expect(accepts("a".repeat(SLUG_MAX_LENGTH + 1))).toBe(false);
  });
});
