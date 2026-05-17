import type { Editor } from "@tiptap/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { InsertButton } from "./FloatingInsertMenu.js";

afterEach(() => {
  cleanup();
});

function stubEditor() {
  const insertContent = vi.fn();
  const focus = vi.fn();
  const chain = {
    focus: () => {
      focus();
      return chain;
    },
    insertContent: (text: string) => {
      insertContent(text);
      return chain;
    },
    run: () => true,
  };
  const editor = { chain: () => chain } as unknown as Editor;
  return { editor, insertContent, focus };
}

describe("FloatingInsertMenu — InsertButton", () => {
  test("renders the + affordance with the documented testid", () => {
    const { editor } = stubEditor();
    render(<InsertButton editor={editor} />);
    expect(screen.queryByTestId("floating-insert-menu")).toBeInTheDocument();
  });

  test("click triggers editor.chain().focus().insertContent('/').run()", () => {
    const { editor, insertContent, focus } = stubEditor();
    render(<InsertButton editor={editor} />);
    fireEvent.click(screen.getByTestId("floating-insert-menu"));
    expect(focus).toHaveBeenCalled();
    expect(insertContent).toHaveBeenCalledWith("/");
  });

  test("button has aria-label for screen readers", () => {
    const { editor } = stubEditor();
    render(<InsertButton editor={editor} />);
    expect(screen.getByTestId("floating-insert-menu")).toHaveAttribute(
      "aria-label",
      "Insert block",
    );
  });
});
