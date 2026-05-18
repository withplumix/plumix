import { Editor, Node } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  BLOCK_MENU_OPEN_EVENT,
  createBlockMenuKeyboardExtension,
} from "../drag-handle/block-menu-keyboard.js";
import { createLongPressBlockMenuExtension } from "./long-press-extension.js";

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

function dispatchTouch(
  target: HTMLElement,
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  touches: readonly { clientX: number; clientY: number }[],
): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "touches", { value: touches });
  target.dispatchEvent(event);
}

describe("createLongPressBlockMenuExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    editor = new Editor({
      extensions: [
        Doc,
        Text,
        Para,
        createBlockMenuKeyboardExtension(),
        createLongPressBlockMenuExtension(),
      ],
      content: "<p>First</p>",
    });
  });

  afterEach(() => {
    editor.destroy();
    vi.useRealTimers();
  });

  test("a long press on the editor view triggers openBlockMenuAtCaret", () => {
    const dom = editor.view.dom;
    const captured: number[] = [];
    dom.addEventListener(BLOCK_MENU_OPEN_EVENT, (event) => {
      captured.push((event as CustomEvent<{ pos: number }>).detail.pos);
    });

    dispatchTouch(dom, "touchstart", [{ clientX: 50, clientY: 50 }]);
    vi.advanceTimersByTime(500);

    expect(captured).toHaveLength(1);
  });

  test("a short tap does not trigger the command", () => {
    const dom = editor.view.dom;
    const spy = vi.fn();
    dom.addEventListener(BLOCK_MENU_OPEN_EVENT, spy);

    dispatchTouch(dom, "touchstart", [{ clientX: 50, clientY: 50 }]);
    vi.advanceTimersByTime(150);
    dispatchTouch(dom, "touchend", []);
    vi.advanceTimersByTime(500);

    expect(spy).not.toHaveBeenCalled();
  });
});
