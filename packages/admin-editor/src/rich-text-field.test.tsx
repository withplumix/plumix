import { cleanup, fireEvent, render } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, test } from "vitest";

import { richTextExtensions } from "./rich-text-extensions.js";
import { LinkPopover } from "./rich-text-field.js";

afterEach(cleanup);

function makeEditor(content: string): Editor {
  return new Editor({ extensions: richTextExtensions(), content });
}

const url = (el: HTMLElement): HTMLInputElement => el as HTMLInputElement;

describe("LinkPopover", () => {
  test("applies a link to the selected text, preserving the selection", () => {
    const editor = makeEditor("<p>select me</p>");
    // Select the whole "select me" run; opening the popover moves DOM focus to
    // the input, so the component must snapshot this range and restore it.
    editor.commands.setTextSelection({ from: 1, to: 10 });

    const { getByTestId } = render(
      <LinkPopover
        editor={editor}
        active={false}
        disabled={false}
        testId="rt"
      />,
    );
    fireEvent.click(getByTestId("rt-link"));
    fireEvent.change(getByTestId("rt-link-url"), {
      target: { value: "https://example.test" },
    });
    fireEvent.submit(getByTestId("rt-link-form"));

    expect(editor.getHTML()).toContain('href="https://example.test"');
    editor.destroy();
  });

  test("pre-fills the current URL when editing an existing link", () => {
    const editor = makeEditor('<p><a href="https://old.test">link</a></p>');
    editor.commands.setTextSelection({ from: 1, to: 5 });

    const { getByTestId } = render(
      <LinkPopover
        editor={editor}
        active={true}
        disabled={false}
        testId="rt"
      />,
    );
    fireEvent.click(getByTestId("rt-link"));

    expect(url(getByTestId("rt-link-url")).value).toBe("https://old.test");
    editor.destroy();
  });

  test("applying an empty URL clears the link", () => {
    const editor = makeEditor('<p><a href="https://old.test">link</a></p>');
    editor.commands.setTextSelection({ from: 1, to: 5 });

    const { getByTestId } = render(
      <LinkPopover
        editor={editor}
        active={true}
        disabled={false}
        testId="rt"
      />,
    );
    fireEvent.click(getByTestId("rt-link"));
    fireEvent.change(getByTestId("rt-link-url"), { target: { value: "  " } });
    fireEvent.submit(getByTestId("rt-link-form"));

    expect(editor.getHTML()).not.toContain("href");
    editor.destroy();
  });

  test("edits the whole link from a collapsed caret inside it", () => {
    const editor = makeEditor('<p><a href="https://old.test">link</a></p>');
    // Collapsed caret in the middle of "link" — extendMarkRange should widen to
    // the whole mark so the new href replaces the old across the entire word.
    editor.commands.setTextSelection({ from: 3, to: 3 });

    const { getByTestId } = render(
      <LinkPopover
        editor={editor}
        active={true}
        disabled={false}
        testId="rt"
      />,
    );
    fireEvent.click(getByTestId("rt-link"));
    expect(url(getByTestId("rt-link-url")).value).toBe("https://old.test");
    fireEvent.change(getByTestId("rt-link-url"), {
      target: { value: "https://new.test" },
    });
    fireEvent.submit(getByTestId("rt-link-form"));

    const html = editor.getHTML();
    expect(html).toContain('href="https://new.test"');
    expect(html).not.toContain("old.test");
    editor.destroy();
  });

  test("removes an existing link", () => {
    const editor = makeEditor('<p><a href="https://old.test">link</a></p>');
    editor.commands.setTextSelection({ from: 1, to: 5 });

    const { getByTestId } = render(
      <LinkPopover
        editor={editor}
        active={true}
        disabled={false}
        testId="rt"
      />,
    );
    fireEvent.click(getByTestId("rt-link"));
    fireEvent.click(getByTestId("rt-link-remove"));

    expect(editor.getHTML()).not.toContain("href");
    editor.destroy();
  });

  test("hides the remove action when no link is active", () => {
    const editor = makeEditor("<p>text</p>");

    const { getByTestId, queryByTestId } = render(
      <LinkPopover
        editor={editor}
        active={false}
        disabled={false}
        testId="rt"
      />,
    );
    fireEvent.click(getByTestId("rt-link"));

    expect(queryByTestId("rt-link-remove")).toBeNull();
    editor.destroy();
  });
});
