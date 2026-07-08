import { describe, expect, test } from "vitest";

import { coreMarkExtensions, coreMarks } from "./index.js";

describe("coreMarks catalogue", () => {
  test("ships the 13 canonical inline marks", () => {
    const names = coreMarks.map((m) => m.name);
    expect(names).toEqual([
      "bold",
      "italic",
      "strike",
      "code",
      "link",
      "underline",
      "subscript",
      "superscript",
      "highlight",
      "kbd",
      "abbr",
      "cite",
      "small",
    ]);
  });

  test("exposes one Tiptap extension per core mark, in the same order", () => {
    expect(coreMarkExtensions.map((extension) => extension.name)).toEqual(
      coreMarks.map((mark) => mark.name),
    );
  });

  test("declares unique mark names with no duplicates", () => {
    const names = coreMarks.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
