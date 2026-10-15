import { describe, expect, test } from "vitest";

import {
  canAddDeclaration,
  canRenameDeclaration,
  declarationSuggestions,
} from "./style-declaration-rules.js";

describe("canRenameDeclaration", () => {
  test("renames onto a valid, unused property", () => {
    expect(canRenameDeclaration("color", "background", ["color"])).toBe(true);
  });

  test("rejects an invalid property name", () => {
    expect(canRenameDeclaration("color", "bad key!", ["color"])).toBe(false);
  });

  test("won't rename onto an existing property (no clobber)", () => {
    expect(
      canRenameDeclaration("color", "background", ["color", "background"]),
    ).toBe(false);
  });

  test("an unchanged name is a no-op, not a rename", () => {
    expect(canRenameDeclaration("color", "color", ["color"])).toBe(false);
  });
});

describe("declarationSuggestions", () => {
  test("offers curated CSS properties", () => {
    expect(declarationSuggestions("", []).options).toEqual(
      expect.arrayContaining(["marginTop", "display"]),
    );
  });

  test("excludes already-set properties", () => {
    expect(declarationSuggestions("", ["color"]).options).not.toContain(
      "color",
    );
  });

  test("offers to create a property outside the curated list", () => {
    expect(declarationSuggestions(" scrollSnapAlign ", []).create).toBe(
      "scrollSnapAlign",
    );
  });

  test("offers to create a CSS custom property", () => {
    expect(declarationSuggestions("--brand-gap", []).create).toBe(
      "--brand-gap",
    );
  });

  test("offers no create item for an invalid property name", () => {
    expect(declarationSuggestions("bad key!", []).create).toBeNull();
  });

  test("offers no create item for a case-variant of a known property", () => {
    expect(declarationSuggestions("margintop", []).create).toBeNull();
  });

  test("offers no create item for a case-variant of a set property", () => {
    expect(
      declarationSuggestions("scrollsnapalign", ["scrollSnapAlign"]).create,
    ).toBeNull();
  });
});

describe("canAddDeclaration", () => {
  test("adds a picked property with a value", () => {
    expect(canAddDeclaration("letterSpacing", "0.05em", [])).toBe(true);
  });

  test("does not add a declaration with an empty value", () => {
    expect(canAddDeclaration("opacity", "  ", [])).toBe(false);
  });

  test("won't overwrite a property that became set after it was picked", () => {
    expect(canAddDeclaration("marginTop", "99px", ["marginTop"])).toBe(false);
  });

  test("does not add without a property", () => {
    expect(canAddDeclaration("", "8px", [])).toBe(false);
  });
});
