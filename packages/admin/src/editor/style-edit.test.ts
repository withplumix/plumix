import type { ResponsiveStyleSlot } from "@plumix/blocks";
import { describe, expect, test } from "vitest";

import { setStyleProperty } from "./style-edit.js";

describe("setStyleProperty", () => {
  test("creates a new bucket when one doesn't yet exist", () => {
    const result = setStyleProperty(undefined, "large", "padding", "md");
    expect(result).toEqual({ large: { padding: "md" } });
  });

  test("merges with an existing bucket, overwriting only the targeted property", () => {
    const before: ResponsiveStyleSlot = {
      large: { padding: "sm", margin: "lg" },
    };
    const result = setStyleProperty(before, "large", "padding", "md");
    expect(result).toEqual({ large: { padding: "md", margin: "lg" } });
  });

  test("preserves other buckets when writing to a different bucket", () => {
    const before: ResponsiveStyleSlot = { large: { padding: "lg" } };
    const result = setStyleProperty(before, "small", "padding", "sm");
    expect(result).toEqual({
      large: { padding: "lg" },
      small: { padding: "sm" },
    });
  });

  test("removes a property when tokenId is undefined", () => {
    const before: ResponsiveStyleSlot = {
      large: { padding: "md", margin: "lg" },
    };
    const result = setStyleProperty(before, "large", "padding", undefined);
    expect(result).toEqual({ large: { margin: "lg" } });
  });

  test("drops an empty bucket after the final property in it is removed", () => {
    const before: ResponsiveStyleSlot = { large: { padding: "md" } };
    const result = setStyleProperty(before, "large", "padding", undefined);
    expect(result).toBeUndefined();
  });

  test("preserves siblings when clearing a property from one bucket", () => {
    const before: ResponsiveStyleSlot = {
      large: { padding: "md" },
      small: { padding: "sm" },
    };
    const result = setStyleProperty(before, "large", "padding", undefined);
    expect(result).toEqual({ small: { padding: "sm" } });
  });

  test("does not mutate the input style object", () => {
    const before: ResponsiveStyleSlot = { large: { padding: "md" } };
    const frozen = Object.freeze({
      large: Object.freeze({ ...before.large }),
    }) as ResponsiveStyleSlot;
    expect(() => setStyleProperty(frozen, "large", "padding", "lg")).not.toThrow();
    expect(frozen.large?.padding).toBe("md");
  });
});
