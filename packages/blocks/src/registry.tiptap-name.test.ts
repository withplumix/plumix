import { Editor, Node } from "@tiptap/core";
import { describe, expect, test } from "vitest";

/**
 * Probe: does ProseMirror's content-expression parser accept node names
 * with slashes? The PRD locks the convention `core/<name>` for both the
 * registry key and the Tiptap node name, and several of the planned
 * blocks (columns → column-only children, lists → list-item-only
 * children) want to express that restriction at the schema level rather
 * than only at the editor surface.
 *
 * Probes the real Tiptap `Editor` constructor (which builds the
 * ProseMirror schema internally) rather than calling ProseMirror's
 * `Schema` directly, so the answer reflects what the admin will see.
 */
const Doc = Node.create({
  name: "doc",
  topNode: true,
  content: "block+",
});

const Text = Node.create({
  name: "text",
  group: "inline",
});

function makeNode(opts: { name: string; group: string; content: string }) {
  return Node.create({
    ...opts,
    parseHTML() {
      return [{ tag: `div[data-name="${opts.name}"]` }];
    },
    renderHTML() {
      return ["div", { "data-name": opts.name }, 0];
    },
  });
}

describe("Tiptap content expressions with slashed names", () => {
  test("an editor builds with a node whose name contains a slash", () => {
    const column = makeNode({
      name: "core/column",
      group: "block",
      content: "text*",
    });
    expect(() => {
      const editor = new Editor({ extensions: [Doc, Text, column] });
      editor.destroy();
    }).not.toThrow();
  });

  test("content expression referencing a slashed name fails to build", () => {
    const child = makeNode({
      name: "core/column",
      group: "block",
      content: "text*",
    });
    const parent = makeNode({
      name: "core/columns",
      group: "block",
      content: "core/column+",
    });
    expect(() => {
      const editor = new Editor({ extensions: [Doc, Text, parent, child] });
      editor.destroy();
    }).toThrowError();
  });

  test("group references work even when nodes have slashes", () => {
    const child = makeNode({
      name: "core/column",
      group: "block coreColumn",
      content: "text*",
    });
    const parent = makeNode({
      name: "core/columns",
      group: "block",
      content: "coreColumn+",
    });
    expect(() => {
      const editor = new Editor({ extensions: [Doc, Text, parent, child] });
      editor.destroy();
    }).not.toThrow();
  });
});
