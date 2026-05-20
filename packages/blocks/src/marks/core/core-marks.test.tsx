import { describe, expect, test } from "vitest";

import { coreMarks } from "./index.js";

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

  test("every core mark carries a Tiptap schema with a matching name", () => {
    for (const mark of coreMarks) {
      expect(mark.schema).toBeDefined();
      expect(mark.schema?.name).toBe(mark.name);
    }
  });

  test("declares unique mark names with no duplicates", () => {
    const names = coreMarks.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
