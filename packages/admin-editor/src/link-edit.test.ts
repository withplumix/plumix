import type { JSONContent, Range } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, test } from "vitest";

import { applyLink, linkHrefAt, removeLink } from "./link-edit.js";
import { richTextExtensions } from "./rich-text-extensions.js";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

/** A headless editor's state over the rich-text schema, `selection` selected. */
function stateOf(paragraph: JSONContent[], selection: Range): Editor["state"] {
  const editor = new Editor({
    element: null,
    extensions: richTextExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: paragraph }],
    },
  });
  editors.push(editor);
  editor.commands.setTextSelection(selection);
  return editor.state;
}

function linked(text: string, href: string): JSONContent {
  return { type: "text", text, marks: [{ type: "link", attrs: { href } }] };
}

/** A text run whose link carries `href`, whatever its other attributes. */
function linkedTo(text: string, href: string): JSONContent {
  return {
    type: "text",
    text,
    marks: [
      {
        type: "link",
        attrs: expect.objectContaining({ href }) as JSONContent["attrs"],
      },
    ],
  };
}

function paragraphOf(state: Editor["state"]): JSONContent[] | undefined {
  const doc = state.doc.toJSON() as JSONContent;
  return doc.content?.[0]?.content;
}

describe("linkHrefAt", () => {
  test("reads the href of the link at the selection", () => {
    const state = stateOf([linked("link", "https://old.test")], {
      from: 1,
      to: 5,
    });

    expect(linkHrefAt(state)).toBe("https://old.test");
  });

  test("is empty outside a link", () => {
    const state = stateOf([{ type: "text", text: "text" }], { from: 1, to: 5 });

    expect(linkHrefAt(state)).toBe("");
  });
});

describe("applyLink", () => {
  test("links the range to the href", () => {
    const state = stateOf([{ type: "text", text: "select me" }], {
      from: 1,
      to: 10,
    });

    const tr = applyLink(state, { from: 1, to: 10 }, "https://example.test");

    expect(paragraphOf(state.apply(tr))).toEqual([
      linkedTo("select me", "https://example.test"),
    ]);
  });

  test("an empty href clears the link", () => {
    const state = stateOf([linked("link", "https://old.test")], {
      from: 1,
      to: 5,
    });

    const tr = applyLink(state, { from: 1, to: 5 }, "");

    expect(paragraphOf(state.apply(tr))).toEqual([
      { type: "text", text: "link" },
    ]);
  });

  test("a collapsed caret inside a link edits the whole link", () => {
    const state = stateOf([linked("link", "https://old.test")], {
      from: 3,
      to: 3,
    });

    const tr = applyLink(state, { from: 3, to: 3 }, "https://new.test");

    expect(paragraphOf(state.apply(tr))).toEqual([
      linkedTo("link", "https://new.test"),
    ]);
  });
});

describe("removeLink", () => {
  test("unlinks the link over the range", () => {
    const state = stateOf([linked("link", "https://old.test")], {
      from: 1,
      to: 5,
    });

    const tr = removeLink(state, { from: 1, to: 5 });

    expect(paragraphOf(state.apply(tr))).toEqual([
      { type: "text", text: "link" },
    ]);
  });
});
