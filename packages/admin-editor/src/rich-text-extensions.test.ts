import { getSchema } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import {
  allowsMark,
  allowsNode,
  richTextExtensions,
  toolbarControls,
} from "./rich-text-extensions.js";

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

  test("offers heading levels h1–h6", () => {
    // Levels match the sanitiser allowlist — both derive from HEADING_LEVELS.
    const heading = richTextExtensions().find((ext) => ext.name === "heading");
    const options = heading?.options as
      { levels?: readonly number[] } | undefined;

    expect(options?.levels).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("registers the blockquote node — quotes are folded into rich text", () => {
    // The Quote block was folded into rich text alongside headings, so the
    // editor must offer a blockquote node.
    const schema = getSchema([...richTextExtensions()]);

    expect(Object.keys(schema.nodes)).toContain("blockquote");
  });
});

describe("richTextExtensions allowlist", () => {
  test("no options admits the full set of marks and block nodes", () => {
    const names = richTextExtensions().map((ext) => ext.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "doc",
        "paragraph",
        "text",
        "bold",
        "italic",
        "link",
        "heading",
        "bulletList",
        "orderedList",
        "blockquote",
      ]),
    );
  });

  test("an allowlist restricts marks and nodes to the named set, with a list's item and keymap", () => {
    const names = richTextExtensions({
      marks: ["bold", "link"],
      nodes: ["bulletList"],
    }).map((ext) => ext.name);

    expect(names).toEqual([
      "doc",
      "paragraph",
      "text",
      "hardBreak",
      "bulletList",
      "listItem",
      "listKeymap",
      "undoRedo",
      "dropCursor",
      "gapCursor",
      "trailingNode",
      "bold",
      "link",
    ]);
  });

  test("empty options admit paragraphs only, with no marks or block nodes", () => {
    const names = richTextExtensions({}).map((ext) => ext.name);

    expect(names).toEqual([
      "doc",
      "paragraph",
      "text",
      "hardBreak",
      "undoRedo",
      "dropCursor",
      "gapCursor",
      "trailingNode",
    ]);
  });
});

describe("allowsMark / allowsNode", () => {
  test.each([
    ["no allowlist admits a mark", undefined, "bold", true],
    ["an allowlist admits a named mark", { marks: ["bold"] }, "bold", true],
    [
      "an allowlist denies an unnamed mark",
      { marks: ["bold"] },
      "italic",
      false,
    ],
    [
      "an omitted marks axis denies every mark",
      { nodes: ["bulletList"] },
      "bold",
      false,
    ],
  ])("%s", (_name, allow, mark, admitted) => {
    expect(allowsMark(allow, mark)).toBe(admitted);
  });

  test.each([
    ["no allowlist admits a node", undefined, "heading", true],
    [
      "an allowlist admits a named node",
      { nodes: ["bulletList"] },
      "bulletList",
      true,
    ],
    [
      "an allowlist denies an unnamed node",
      { nodes: ["bulletList"] },
      "heading",
      false,
    ],
  ])("%s", (_name, allow, node, admitted) => {
    expect(allowsNode(allow, node)).toBe(admitted);
  });
});

describe("toolbarControls", () => {
  test("a constrained field offers only its allowed controls", () => {
    expect(toolbarControls({ marks: ["bold"], nodes: [] })).toEqual({
      marks: ["bold"],
      format: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
      link: false,
    });
  });

  test("no allowlist offers the full toolbar", () => {
    expect(toolbarControls(undefined)).toEqual({
      marks: [
        "bold",
        "italic",
        "underline",
        "strike",
        "code",
        "highlight",
        "subscript",
        "superscript",
      ],
      format: true,
      bulletList: true,
      orderedList: true,
      blockquote: true,
      link: true,
    });
  });
});
