import { getSchema } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import { HEADING_LEVELS, richTextExtensions } from "./rich-text-extensions.js";

describe("richTextExtensions", () => {
  // getSchema throws on a duplicate extension name, so a clean build proves the
  // core marks and StarterKit's bundled marks don't collide.
  test("builds one schema from StarterKit nodes + the core marks", () => {
    const schema = getSchema([...richTextExtensions()]);

    expect(Object.keys(schema.marks)).toEqual(
      expect.arrayContaining([
        "bold",
        "italic",
        "underline",
        "strike",
        "code",
        "link",
        "highlight",
      ]),
    );
    expect(Object.keys(schema.nodes)).toEqual(
      expect.arrayContaining([
        "paragraph",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
      ]),
    );
  });

  test("restricts headings to h2–h4, matching the render sanitizer", () => {
    // h1/h5/h6 are stripped by the block's sanitizer, so the editor must not
    // offer them. The constant gates both the schema and the toolbar.
    expect(HEADING_LEVELS).toEqual([2, 3, 4]);
  });
});
