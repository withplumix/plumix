import type { Editor } from "@tiptap/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { BlockRegistry, ResolvedBlockSpec } from "@plumix/blocks";

import { Inspector } from "./Inspector.js";

afterEach(() => {
  cleanup();
});

function spec(
  partial: Partial<ResolvedBlockSpec> & { name: string; title: string },
): ResolvedBlockSpec {
  return {
    name: partial.name,
    title: partial.title,
    description: partial.description,
    category: partial.category ?? "typography",
    keywords: partial.keywords,
    attributes: partial.attributes,
    supports: partial.supports,
    component: () => null,
    legacyAliases: undefined,
    schema: undefined,
    registeredBy: null,
    editor: undefined,
    client: undefined,
  } as unknown as ResolvedBlockSpec;
}

function fakeRegistry(specs: readonly ResolvedBlockSpec[]): BlockRegistry {
  const map = new Map(specs.map((s) => [s.name, s]));
  return {
    get: (n) => map.get(n),
    has: (n) => map.has(n),
    size: map.size,
    [Symbol.iterator]: () => map.entries(),
  } satisfies BlockRegistry;
}

interface SelectionState {
  readonly nodeType: string | null;
  readonly attrs: Record<string, unknown>;
}

function stubEditor(selection: SelectionState) {
  const updateAttributes = vi.fn();
  const chain = {
    focus: () => chain,
    updateAttributes: (type: string, attrs: Record<string, unknown>) => {
      updateAttributes(type, attrs);
      return chain;
    },
    run: () => true,
  };
  const listeners = new Map<string, Set<() => void>>();
  const editor = {
    chain: () => chain,
    on: (event: string, fn: () => void) => {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(fn);
      listeners.set(event, bucket);
      return editor;
    },
    off: (event: string, fn: () => void) => {
      listeners.get(event)?.delete(fn);
      return editor;
    },
    state: {
      get selection() {
        if (selection.nodeType === null) {
          return { $from: { parent: { type: { name: "doc" }, attrs: {} } } };
        }
        return {
          $from: {
            parent: {
              type: { name: selection.nodeType },
              attrs: selection.attrs,
            },
          },
        };
      },
    },
  } as unknown as Editor;
  return {
    editor,
    updateAttributes,
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
  };
}

describe("Inspector", () => {
  test("renders nothing when selection is in a node without a registered spec", () => {
    const registry = fakeRegistry([]);
    const { editor } = stubEditor({ nodeType: null, attrs: {} });
    const { container } = render(
      <Inspector editor={editor} blockRegistry={registry} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders one InspectorField per declared attribute, preserving order", () => {
    const headingSpec = spec({
      name: "core/heading",
      title: "Heading",
      attributes: {
        level: {
          type: "select",
          label: "Heading level",
          default: 2,
          options: [
            { value: 1, label: "H1" },
            { value: 2, label: "H2" },
            { value: 3, label: "H3" },
          ],
        },
        anchor: {
          type: "link",
          label: "Anchor",
          default: "",
        },
      },
    });
    const registry = fakeRegistry([headingSpec]);
    const { editor } = stubEditor({
      nodeType: "core/heading",
      attrs: { level: 2 },
    });
    render(<Inspector editor={editor} blockRegistry={registry} />);
    expect(screen.getByTestId("inspector-field-level")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-field-anchor")).toBeInTheDocument();
  });

  test("changing a field calls editor.chain().focus().updateAttributes()", () => {
    const headingSpec = spec({
      name: "core/heading",
      title: "Heading",
      attributes: {
        level: {
          type: "select",
          label: "Heading level",
          default: 2,
          options: [
            { value: 1, label: "H1" },
            { value: 2, label: "H2" },
            { value: 3, label: "H3" },
          ],
        },
      },
    });
    const registry = fakeRegistry([headingSpec]);
    const { editor, updateAttributes } = stubEditor({
      nodeType: "core/heading",
      attrs: { level: 2 },
    });
    render(<Inspector editor={editor} blockRegistry={registry} />);
    fireEvent.change(screen.getByTestId("inspector-field-level"), {
      target: { value: "3" },
    });
    expect(updateAttributes).toHaveBeenCalledWith("core/heading", {
      level: 3,
    });
  });

  test("renders nothing when the selected node's spec has no attributes", () => {
    const paragraph = spec({
      name: "core/paragraph",
      title: "Paragraph",
      attributes: undefined,
    });
    const registry = fakeRegistry([paragraph]);
    const { editor } = stubEditor({
      nodeType: "core/paragraph",
      attrs: {},
    });
    const { container } = render(
      <Inspector editor={editor} blockRegistry={registry} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("registers a transaction listener on mount and removes it on unmount", () => {
    const registry = fakeRegistry([]);
    const { editor, listenerCount } = stubEditor({
      nodeType: null,
      attrs: {},
    });
    const { unmount } = render(
      <Inspector editor={editor} blockRegistry={registry} />,
    );
    expect(listenerCount("transaction")).toBe(1);
    unmount();
    expect(listenerCount("transaction")).toBe(0);
  });

  test("shows attr=false rather than the schema default (no `??` swallow)", () => {
    const boolSpec = spec({
      name: "core/probe",
      title: "Probe",
      attributes: {
        enabled: { type: "boolean", label: "Enabled", default: true },
      },
    });
    const registry = fakeRegistry([boolSpec]);
    const { editor } = stubEditor({
      nodeType: "core/probe",
      attrs: { enabled: false },
    });
    render(<Inspector editor={editor} blockRegistry={registry} />);
    const checkbox = document.querySelector<HTMLInputElement>(
      '[data-testid="inspector-field-enabled"]',
    );
    if (!checkbox) throw new Error("inspector-field-enabled not rendered");
    expect(checkbox.checked).toBe(false);
  });

  test("hides the Supports section when the spec declares no supports", () => {
    const noSupports = spec({
      name: "core/plain",
      title: "Plain",
      attributes: { level: { type: "select", label: "Level", default: 1 } },
    });
    const registry = fakeRegistry([noSupports]);
    const { editor } = stubEditor({
      nodeType: "core/plain",
      attrs: { level: 1 },
    });
    const { queryByTestId } = render(
      <Inspector editor={editor} blockRegistry={registry} />,
    );
    expect(queryByTestId("inspector-supports-section")).toBeNull();
  });

  test("renders an anchor input when the spec opts into supports.anchor", () => {
    const withAnchor = spec({
      name: "core/heading",
      title: "Heading",
      attributes: { level: { type: "select", label: "Level", default: 2 } },
      supports: { anchor: true },
    });
    const registry = fakeRegistry([withAnchor]);
    const { editor, updateAttributes } = stubEditor({
      nodeType: "core/heading",
      attrs: { level: 2, style: { anchor: "intro" } },
    });
    const { getByTestId } = render(
      <Inspector editor={editor} blockRegistry={registry} />,
    );
    expect(getByTestId("inspector-supports-section")).toBeInTheDocument();
    const input = getByTestId("inspector-supports-anchor") as HTMLInputElement;
    expect(input.value).toBe("intro");

    fireEvent.change(input, { target: { value: "section-2" } });
    expect(updateAttributes).toHaveBeenCalledWith("core/heading", {
      style: { anchor: "section-2" },
    });
  });
});
