import { Editor, Node } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import { headingSchema } from "./schema.js";

const Doc = Node.create({ name: "doc", topNode: true, content: "block+" });
const Text = Node.create({ name: "text", group: "inline" });

function bootEditor(json: Parameters<Editor["commands"]["setContent"]>[0]): Editor {
  return new Editor({
    extensions: [Doc, Text, headingSchema],
    content: json,
  });
}

describe("core/heading editor schema honors the level attribute", () => {
  test("default level renders as <h2>", () => {
    const editor = bootEditor({
      type: "doc",
      content: [
        {
          type: "core/heading",
          content: [{ type: "text", text: "Hi" }],
        },
      ],
    });
    expect(editor.getHTML()).toContain("<h2>");
    editor.destroy();
  });

  test.each([1, 2, 3, 4, 5, 6])(
    "level=%i renders as <h%i>",
    (level) => {
      const editor = bootEditor({
        type: "doc",
        content: [
          {
            type: "core/heading",
            attrs: { level },
            content: [{ type: "text", text: "Hi" }],
          },
        ],
      });
      expect(editor.getHTML()).toContain(`<h${level}>`);
      editor.destroy();
    },
  );

  test("parseHTML round-trips the level from h1..h6 tags", () => {
    const editor = bootEditor("<h3>Section</h3>");
    const first = editor.state.doc.firstChild;
    expect(first?.type.name).toBe("core/heading");
    expect(first?.attrs.level).toBe(3);
    editor.destroy();
  });

  // Mirrors the Frontend Component's clamp contract (heading.test.tsx).
  // Both surfaces share semantics so out-of-bounds attrs render as <h1>
  // / <h6> regardless of how the doc got that way.
  test.each([
    { level: 0, expected: 1 },
    { level: -3, expected: 1 },
    { level: 7, expected: 6 },
    { level: 99, expected: 6 },
    { level: 2.7, expected: 2 },
    { level: "two", expected: 2 },
  ])("clamps level=$level to <h$expected>", ({ level, expected }) => {
    const editor = bootEditor({
      type: "doc",
      content: [
        {
          type: "core/heading",
          attrs: { level },
          content: [{ type: "text", text: "Hi" }],
        },
      ],
    });
    expect(editor.getHTML()).toContain(`<h${expected}>`);
    editor.destroy();
  });

  test("renderHTML emits the tag only — no leaked `level` attribute", () => {
    const editor = bootEditor({
      type: "doc",
      content: [
        {
          type: "core/heading",
          attrs: { level: 4 },
          content: [{ type: "text", text: "Hi" }],
        },
      ],
    });
    // The level is encoded by the tag itself; serializing it as an
    // attribute would clobber arbitrary HTMLAttributes and confuse the
    // server-side renderer which round-trips via the same DOM.
    expect(editor.getHTML()).toBe("<h4>Hi</h4>");
    editor.destroy();
  });
});
