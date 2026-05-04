import type { Editor } from "@tiptap/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { TiptapToolbar } from "./tiptap-toolbar.js";

afterEach(() => {
  cleanup();
});

// Minimal editor stub. The toolbar reads `isActive` per render and
// invokes the `chain().focus()...` pipeline on click; the filter
// tests don't fire any clicks so the no-op chain is fine.
function stubEditor(): Editor {
  const chain = {
    focus: () => chain,
    toggleBold: () => chain,
    toggleItalic: () => chain,
    toggleHeading: () => chain,
    toggleBulletList: () => chain,
    toggleOrderedList: () => chain,
    extendMarkRange: () => chain,
    setLink: () => chain,
    unsetLink: () => chain,
    run: () => true,
  };
  return {
    isActive: () => false,
    chain: () => chain,
    getAttributes: () => ({}),
  } as unknown as Editor;
}

const ALL_TESTIDS = [
  "tiptap-toolbar-bold",
  "tiptap-toolbar-italic",
  "tiptap-toolbar-h2",
  "tiptap-toolbar-h3",
  "tiptap-toolbar-bullet",
  "tiptap-toolbar-ordered",
  "tiptap-toolbar-link",
] as const;

describe("TiptapToolbar — allowlist filter", () => {
  test("undefined allowlist (canvas mode) surfaces every built-in button", () => {
    render(<TiptapToolbar editor={stubEditor()} disabled={false} />);
    for (const id of ALL_TESTIDS) {
      expect(screen.queryByTestId(id)).toBeInTheDocument();
    }
  });

  test("strict allowlist surfaces only buttons whose requires intersect", () => {
    render(
      <TiptapToolbar
        editor={stubEditor()}
        disabled={false}
        allowlist={{ marks: ["bold"], nodes: [] }}
      />,
    );
    expect(screen.queryByTestId("tiptap-toolbar-bold")).toBeInTheDocument();
    expect(
      screen.queryByTestId("tiptap-toolbar-italic"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("tiptap-toolbar-h2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tiptap-toolbar-h3")).not.toBeInTheDocument();
  });

  test("heading node enables both H2 and H3 buttons (single node, two affordances)", () => {
    render(
      <TiptapToolbar
        editor={stubEditor()}
        disabled={false}
        allowlist={{ nodes: ["heading"] }}
      />,
    );
    expect(screen.queryByTestId("tiptap-toolbar-h2")).toBeInTheDocument();
    expect(screen.queryByTestId("tiptap-toolbar-h3")).toBeInTheDocument();
    expect(screen.queryByTestId("tiptap-toolbar-bold")).not.toBeInTheDocument();
  });

  test("empty allowlist arrays surface no toolbar buttons", () => {
    render(
      <TiptapToolbar
        editor={stubEditor()}
        disabled={false}
        allowlist={{ marks: [], nodes: [] }}
      />,
    );
    for (const id of ALL_TESTIDS) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
  });

  test("link mark allowance surfaces only the Link button", () => {
    render(
      <TiptapToolbar
        editor={stubEditor()}
        disabled={false}
        allowlist={{ marks: ["link"] }}
      />,
    );
    expect(screen.queryByTestId("tiptap-toolbar-link")).toBeInTheDocument();
    expect(screen.queryByTestId("tiptap-toolbar-bold")).not.toBeInTheDocument();
  });
});
