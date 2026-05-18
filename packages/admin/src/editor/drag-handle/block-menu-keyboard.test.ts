import { Editor, Node } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import type { BlockMenuOpenDetail } from "./block-menu-keyboard.js";
import {
  BLOCK_MENU_OPEN_EVENT,
  createBlockMenuKeyboardExtension,
} from "./block-menu-keyboard.js";

const Doc = Node.create({ name: "doc", topNode: true, content: "block+" });
const Text = Node.create({ name: "text", group: "inline" });
const Para = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  parseHTML() {
    return [{ tag: "p" }];
  },
  renderHTML() {
    return ["p", 0];
  },
});

function bootEditor(): Editor {
  return new Editor({
    extensions: [Doc, Text, Para, createBlockMenuKeyboardExtension()],
    content: "<p>First</p><p>Second</p>",
  });
}

describe("createBlockMenuKeyboardExtension", () => {
  test("Mod-Alt-ArrowLeft dispatches BLOCK_MENU_OPEN_EVENT with the caret block's pos", () => {
    const editor = bootEditor();
    editor.commands.setTextSelection(10); // inside "Second"
    const captured: BlockMenuOpenDetail[] = [];
    editor.view.dom.addEventListener(BLOCK_MENU_OPEN_EVENT, (event) => {
      captured.push((event as CustomEvent<BlockMenuOpenDetail>).detail);
    });

    const handled = editor.commands.openBlockMenuAtCaret();

    expect(handled).toBe(true);
    expect(captured).toHaveLength(1);
    // First p occupies positions 0..6 (nodeSize 7); the second p
    // begins at pos 7, which is what doc.nodeAt() resolves to.
    expect(captured[0]?.pos).toBe(7);
    const node = editor.state.doc.nodeAt(captured[0]?.pos ?? -1);
    expect(node?.type.name).toBe("paragraph");
    editor.destroy();
  });

  test("empty paragraph — command still resolves to the enclosing block", () => {
    const editor = new Editor({
      extensions: [Doc, Text, Para, createBlockMenuKeyboardExtension()],
      content: "<p></p>",
    });
    const captured: BlockMenuOpenDetail[] = [];
    editor.view.dom.addEventListener(BLOCK_MENU_OPEN_EVENT, (event) => {
      captured.push((event as CustomEvent<BlockMenuOpenDetail>).detail);
    });

    const handled = editor.commands.openBlockMenuAtCaret();

    expect(handled).toBe(true);
    expect(captured).toHaveLength(1);
    expect(editor.state.doc.nodeAt(captured[0]?.pos ?? -1)?.type.name).toBe(
      "paragraph",
    );
    editor.destroy();
  });

  test("no-op when the slash-menu mount is already in the DOM", () => {
    const editor = bootEditor();
    editor.commands.setTextSelection(10);
    const captured: BlockMenuOpenDetail[] = [];
    editor.view.dom.addEventListener(BLOCK_MENU_OPEN_EVENT, (event) => {
      captured.push((event as CustomEvent<BlockMenuOpenDetail>).detail);
    });

    // Simulate the slash-menu mount being present (suggestion plugin
    // has opened it). The shortcut should bow out so we don't stack a
    // second popover over the first.
    const slashMount = document.createElement("div");
    slashMount.setAttribute("data-plumix-slash-menu-mount", "");
    document.body.appendChild(slashMount);
    try {
      const handled = editor.commands.openBlockMenuAtCaret();
      expect(handled).toBe(false);
      expect(captured).toHaveLength(0);
    } finally {
      slashMount.remove();
      editor.destroy();
    }
  });
});
