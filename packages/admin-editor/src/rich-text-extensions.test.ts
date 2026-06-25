import { getSchema } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import { richTextExtensions } from "./rich-text-extensions.js";

describe("richTextExtensions", () => {
  // getSchema throws on a duplicate extension name, so a clean build proves the
  // explicit nodes and the core marks don't collide.
  test("builds one schema from the explicit nodes + the core marks", () => {
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

  test("registers the heading node — headings are inline formats of rich text", () => {
    // The Heading block was folded into rich text (Notion-style single Text
    // block), so the editor must offer heading nodes.
    const schema = getSchema([...richTextExtensions()]);

    expect(Object.keys(schema.nodes)).toContain("heading");
  });

  test("offers heading levels h1–h4 only", () => {
    // h1–h4 match the sanitiser allowlist; h5/h6 are intentionally excluded.
    const heading = richTextExtensions().find((ext) => ext.name === "heading");
    const options = heading?.options as
      | { levels?: readonly number[] }
      | undefined;

    expect(options?.levels).toEqual([1, 2, 3, 4]);
  });

  test("registers the blockquote node — quotes are folded into rich text", () => {
    // The Quote block was folded into rich text alongside headings, so the
    // editor must offer a blockquote node.
    const schema = getSchema([...richTextExtensions()]);

    expect(Object.keys(schema.nodes)).toContain("blockquote");
  });
});
