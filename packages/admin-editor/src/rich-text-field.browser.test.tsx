import type { ReactElement } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, test } from "vitest";

import type { JSONContent } from "./rich-text-field.js";
import {
  allowsMark,
  allowsNode,
  richTextExtensions,
} from "./rich-text-extensions.js";
import { LinkPopover, RichTextField } from "./rich-text-field.js";

afterEach(cleanup);

i18n.loadAndActivate({ locale: "en", messages: {} });

// The editor renders a `<Trans>` hint, so its render needs the i18n context.
const renderRT = (ui: ReactElement): ReturnType<typeof render> =>
  render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);

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

describe("richTextExtensions allowlist", () => {
  const names = (exts: ReturnType<typeof richTextExtensions>): Set<string> =>
    new Set(exts.map((e) => e.name));

  test("no options → the full editor set (marks, headings, lists, quote)", () => {
    const set = names(richTextExtensions());
    // Schema essentials
    expect(set.has("doc")).toBe(true);
    expect(set.has("paragraph")).toBe(true);
    expect(set.has("text")).toBe(true);
    // Marks + block nodes all present
    expect(set.has("bold")).toBe(true);
    expect(set.has("italic")).toBe(true);
    expect(set.has("link")).toBe(true);
    expect(set.has("heading")).toBe(true);
    expect(set.has("bulletList")).toBe(true);
    expect(set.has("orderedList")).toBe(true);
    expect(set.has("blockquote")).toBe(true);
  });

  test("an allowlist restricts marks and nodes to the named set", () => {
    const set = names(
      richTextExtensions({ marks: ["bold", "link"], nodes: ["bulletList"] }),
    );
    // Allowed
    expect(set.has("bold")).toBe(true);
    expect(set.has("link")).toBe(true);
    expect(set.has("bulletList")).toBe(true);
    // A list node pulls in its item + keymap so it actually works
    expect(set.has("listItem")).toBe(true);
    // Denied marks / nodes
    expect(set.has("italic")).toBe(false);
    expect(set.has("code")).toBe(false);
    expect(set.has("heading")).toBe(false);
    expect(set.has("orderedList")).toBe(false);
    expect(set.has("blockquote")).toBe(false);
    // Schema essentials survive regardless
    expect(set.has("doc")).toBe(true);
    expect(set.has("paragraph")).toBe(true);
  });

  test("empty options → paragraphs only (deny all marks and block nodes)", () => {
    const set = names(richTextExtensions({}));
    expect(set.has("bold")).toBe(false);
    expect(set.has("heading")).toBe(false);
    expect(set.has("bulletList")).toBe(false);
    expect(set.has("blockquote")).toBe(false);
    expect(set.has("paragraph")).toBe(true);
    expect(set.has("doc")).toBe(true);
  });
});

describe("RichTextField toolbar reflects the allowlist", () => {
  test("a constrained field offers only its allowed controls", () => {
    const { queryByTestId } = renderRT(
      <RichTextField
        serialization="json"
        value={null}
        onChange={() => undefined}
        allow={{ marks: ["bold"], nodes: [] }}
        testId="rt"
      />,
    );
    // Allowed
    expect(queryByTestId("rt-bold")).not.toBeNull();
    // Denied marks / nodes are absent, not just disabled
    expect(queryByTestId("rt-italic")).toBeNull();
    expect(queryByTestId("rt-format")).toBeNull(); // no headings → no format select
    expect(queryByTestId("rt-bullet-list")).toBeNull();
    expect(queryByTestId("rt-blockquote")).toBeNull();
    expect(queryByTestId("rt-link")).toBeNull();
    // Clear formatting is always available
    expect(queryByTestId("rt-clear")).not.toBeNull();
  });

  test("JSON mode clears the editor when the value resets to null", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello" }] },
      ],
    };
    const wrap = (value: JSONContent | null): ReactElement => (
      <I18nProvider i18n={i18n}>
        <RichTextField
          serialization="json"
          value={value}
          onChange={() => undefined}
          testId="rtc"
        />
      </I18nProvider>
    );
    const { rerender, getByTestId } = render(wrap(doc));
    expect(getByTestId("rtc-editor").textContent).toContain("hello");
    // An external reset to null must clear the on-screen doc, not leave it stale.
    rerender(wrap(null));
    expect(getByTestId("rtc-editor").textContent).not.toContain("hello");
  });

  test("no allowlist renders the full toolbar (block-editor default)", () => {
    const { queryByTestId } = renderRT(
      <RichTextField value="" onChange={() => undefined} testId="rt2" />,
    );
    expect(queryByTestId("rt2-format")).not.toBeNull();
    expect(queryByTestId("rt2-bold")).not.toBeNull();
    expect(queryByTestId("rt2-bullet-list")).not.toBeNull();
    expect(queryByTestId("rt2-blockquote")).not.toBeNull();
    expect(queryByTestId("rt2-link")).not.toBeNull();
  });
});

describe("allowsMark / allowsNode predicates", () => {
  test("no allowlist admits everything (block-editor default)", () => {
    expect(allowsMark(undefined, "bold")).toBe(true);
    expect(allowsNode(undefined, "heading")).toBe(true);
  });

  test("an allowlist admits only the named entries", () => {
    const allow = { marks: ["bold"], nodes: ["bulletList"] };
    expect(allowsMark(allow, "bold")).toBe(true);
    expect(allowsMark(allow, "italic")).toBe(false);
    expect(allowsNode(allow, "bulletList")).toBe(true);
    expect(allowsNode(allow, "heading")).toBe(false);
    // Omitted axis denies all of that axis
    expect(allowsMark({ nodes: ["bulletList"] }, "bold")).toBe(false);
  });
});
