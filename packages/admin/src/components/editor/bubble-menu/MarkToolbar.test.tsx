import type { Editor } from "@tiptap/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { MarkRegistry } from "@plumix/blocks";
import { coreMarks, mergeMarkRegistry } from "@plumix/blocks";

import { MarkToolbar } from "./MarkToolbar.js";

afterEach(() => {
  cleanup();
});

const ALL_CORE_MARK_NAMES = [
  "bold",
  "italic",
  "strike",
  "code",
  "link",
  "underline",
  "subscript",
  "superscript",
  "highlight",
  "kbd",
  "abbr",
  "cite",
  "small",
] as const;

interface StubEditorOptions {
  readonly activeMarks?: readonly string[];
  readonly schemaMarks?: readonly string[];
}

function stubEditor(opts: StubEditorOptions = {}): {
  editor: Editor;
  toggleMark: ReturnType<typeof vi.fn>;
} {
  const toggleMark = vi.fn();
  const chain = {
    focus: () => chain,
    toggleMark: (name: string) => {
      toggleMark(name);
      return chain;
    },
    run: () => true,
  };
  const activeSet = new Set(opts.activeMarks ?? []);
  const schemaMarks = Object.fromEntries(
    (opts.schemaMarks ?? ALL_CORE_MARK_NAMES).map((name) => [name, {}]),
  );
  const editor = {
    isActive: (name: string) => activeSet.has(name),
    chain: () => chain,
    schema: { marks: schemaMarks },
  } as unknown as Editor;
  return { editor, toggleMark };
}

async function buildRegistry(): Promise<MarkRegistry> {
  return mergeMarkRegistry({
    core: coreMarks,
    plugins: [],
    themeOverrides: {},
    themeId: null,
  });
}

describe("MarkToolbar", () => {
  test("renders one button per registered mark", async () => {
    const { editor } = stubEditor();
    const markRegistry = await buildRegistry();
    render(<MarkToolbar editor={editor} markRegistry={markRegistry} />);

    for (const name of [
      "bold",
      "italic",
      "strike",
      "code",
      "link",
      "underline",
      "subscript",
      "superscript",
      "highlight",
      "kbd",
      "abbr",
      "cite",
      "small",
    ]) {
      expect(screen.queryByTestId(`bubble-menu-${name}`)).toBeInTheDocument();
    }
  });

  test("button click invokes editor.chain().focus().toggleMark(name).run()", async () => {
    const { editor, toggleMark } = stubEditor();
    const markRegistry = await buildRegistry();
    render(<MarkToolbar editor={editor} markRegistry={markRegistry} />);

    fireEvent.click(screen.getByTestId("bubble-menu-bold"));
    expect(toggleMark).toHaveBeenCalledWith("bold");

    fireEvent.click(screen.getByTestId("bubble-menu-italic"));
    expect(toggleMark).toHaveBeenCalledWith("italic");
  });

  test("aria-pressed reflects editor.isActive", async () => {
    const { editor } = stubEditor({ activeMarks: ["bold", "underline"] });
    const markRegistry = await buildRegistry();
    render(<MarkToolbar editor={editor} markRegistry={markRegistry} />);

    expect(screen.getByTestId("bubble-menu-bold")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("bubble-menu-underline")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("bubble-menu-italic")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("button has aria-label from bubbleMenuLabel ?? title", async () => {
    const { editor } = stubEditor();
    const markRegistry = await buildRegistry();
    render(<MarkToolbar editor={editor} markRegistry={markRegistry} />);

    expect(screen.getByTestId("bubble-menu-bold")).toHaveAttribute(
      "aria-label",
      "Bold",
    );
    expect(screen.getByTestId("bubble-menu-code")).toHaveAttribute(
      "aria-label",
      "Inline code",
    );
  });

  test("filters out marks not present in editor.schema.marks", async () => {
    const { editor } = stubEditor({
      schemaMarks: ["bold", "italic", "strike", "code", "link"],
    });
    const markRegistry = await buildRegistry();
    render(<MarkToolbar editor={editor} markRegistry={markRegistry} />);

    for (const present of ["bold", "italic", "strike", "code", "link"]) {
      expect(
        screen.queryByTestId(`bubble-menu-${present}`),
      ).toBeInTheDocument();
    }
    for (const missing of [
      "underline",
      "subscript",
      "superscript",
      "highlight",
      "kbd",
      "abbr",
      "cite",
      "small",
    ]) {
      expect(screen.queryByTestId(`bubble-menu-${missing}`)).toBeNull();
    }
  });

  test("ArrowRight moves focus to the next button; ArrowLeft moves back; wraps at the ends", async () => {
    const { editor } = stubEditor({
      schemaMarks: ["bold", "italic", "strike"],
    });
    const markRegistry = await buildRegistry();
    render(<MarkToolbar editor={editor} markRegistry={markRegistry} />);

    const bold = screen.getByTestId("bubble-menu-bold");
    const italic = screen.getByTestId("bubble-menu-italic");
    const strike = screen.getByTestId("bubble-menu-strike");

    bold.focus();
    expect(document.activeElement).toBe(bold);

    fireEvent.keyDown(bold, { key: "ArrowRight" });
    expect(document.activeElement).toBe(italic);

    fireEvent.keyDown(italic, { key: "ArrowRight" });
    expect(document.activeElement).toBe(strike);

    // Wrap forward
    fireEvent.keyDown(strike, { key: "ArrowRight" });
    expect(document.activeElement).toBe(bold);

    // Wrap backward
    fireEvent.keyDown(bold, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(strike);
  });
});
