import { getSchema } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import { richTextExtensions } from "./rich-text-extensions.js";

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
        "bulletList",
        "orderedList",
        "listItem",
      ]),
    );
  });

  test("registers no heading node — headings live in the Heading block", () => {
    // Rich text is prose only; structural headings are a separate block, so the
    // editor must neither offer nor produce heading nodes.
    const schema = getSchema([...richTextExtensions()]);

    expect(Object.keys(schema.nodes)).not.toContain("heading");
  });
});
