import type { Editor, Mark } from "@tiptap/core";
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

  // The cheatsheet's Formatting rows are read straight off `keyboardShortcut`,
  // so a chord advertised there and bound nowhere is a lie the editor tells.
  test("binds the chord each mark advertises to its own toggle", () => {
    const toggled: string[] = [];
    // A binding reaches only `toggleMark`, and Tiptap types the callback's
    // `this` as the whole extension context it never reads — so both stand in.
    const editor = {
      commands: { toggleMark: (name: string) => toggled.push(name) > 0 },
    } as unknown as Editor;
    const context = { editor } as unknown as ThisParameterType<
      NonNullable<Mark["config"]["addKeyboardShortcuts"]>
    >;

    for (const mark of coreMarks) {
      if (mark.keyboardShortcut === undefined) continue;
      const extension = coreMarkExtensions.find((e) => e.name === mark.name);
      const bindings =
        extension?.config.addKeyboardShortcuts?.call(context) ?? {};

      expect(Object.keys(bindings)).toEqual([mark.keyboardShortcut]);
      bindings[mark.keyboardShortcut]?.({ editor });
      expect(toggled.at(-1)).toBe(mark.name);
    }

    expect(toggled).toEqual(["bold", "italic", "strike", "code", "underline"]);
  });

  test("declares unique mark names with no duplicates", () => {
    const names = coreMarks.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
