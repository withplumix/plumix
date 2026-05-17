import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { BlockRegistry, ResolvedBlockSpec } from "@plumix/blocks";

import { BlockMenu } from "./BlockMenu.js";

afterEach(() => {
  cleanup();
});

function spec(
  partial: Partial<ResolvedBlockSpec> & { name: string; title: string },
): ResolvedBlockSpec {
  const out: Partial<ResolvedBlockSpec> = {
    name: partial.name,
    title: partial.title,
    component: () => null,
    registeredBy: null,
    transforms: partial.transforms,
  };
  return out as ResolvedBlockSpec;
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

describe("BlockMenu", () => {
  test("renders the four canonical actions", () => {
    const paragraph = spec({ name: "core/paragraph", title: "Paragraph" });
    render(
      <BlockMenu
        sourceName="core/paragraph"
        blockRegistry={fakeRegistry([paragraph])}
        onTransform={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onCopyJson={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("block-menu-duplicate")).toBeInTheDocument();
    expect(screen.queryByTestId("block-menu-delete")).toBeInTheDocument();
    expect(screen.queryByTestId("block-menu-copy-json")).toBeInTheDocument();
  });

  test("renders Transform-to entries from the resolver", () => {
    const heading = spec({ name: "core/heading", title: "Heading" });
    const quote = spec({ name: "core/quote", title: "Quote" });
    const paragraph = spec({
      name: "core/paragraph",
      title: "Paragraph",
      transforms: {
        to: [{ target: "core/heading" }, { target: "core/quote" }],
      },
    });
    const registry = fakeRegistry([paragraph, heading, quote]);
    render(
      <BlockMenu
        sourceName="core/paragraph"
        blockRegistry={registry}
        onTransform={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onCopyJson={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("block-menu-transform-core/heading"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("block-menu-transform-core/quote"),
    ).toBeInTheDocument();
  });

  test("clicking a transform entry invokes onTransform with the target name", () => {
    const heading = spec({ name: "core/heading", title: "Heading" });
    const paragraph = spec({
      name: "core/paragraph",
      title: "Paragraph",
      transforms: { to: [{ target: "core/heading" }] },
    });
    const onTransform = vi.fn();
    render(
      <BlockMenu
        sourceName="core/paragraph"
        blockRegistry={fakeRegistry([paragraph, heading])}
        onTransform={onTransform}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onCopyJson={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("block-menu-transform-core/heading"));
    expect(onTransform).toHaveBeenCalledWith(
      expect.objectContaining({ target: "core/heading" }),
    );
  });

  test("clicking Duplicate / Delete / Copy JSON fires their callbacks", () => {
    const paragraph = spec({ name: "core/paragraph", title: "Paragraph" });
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const onCopyJson = vi.fn();
    render(
      <BlockMenu
        sourceName="core/paragraph"
        blockRegistry={fakeRegistry([paragraph])}
        onTransform={vi.fn()}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onCopyJson={onCopyJson}
      />,
    );
    fireEvent.click(screen.getByTestId("block-menu-duplicate"));
    fireEvent.click(screen.getByTestId("block-menu-delete"));
    fireEvent.click(screen.getByTestId("block-menu-copy-json"));
    expect(onDuplicate).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
    expect(onCopyJson).toHaveBeenCalled();
  });

  test("renders without crashing when the source has no transform targets", () => {
    const orphan = spec({ name: "core/orphan", title: "Orphan" });
    render(
      <BlockMenu
        sourceName="core/orphan"
        blockRegistry={fakeRegistry([orphan])}
        onTransform={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onCopyJson={vi.fn()}
      />,
    );
    // Transform section is absent; the three canonical actions remain.
    expect(screen.queryByTestId("block-menu-duplicate")).toBeInTheDocument();
  });
});
