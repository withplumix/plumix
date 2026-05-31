import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { BlockVariation } from "@plumix/blocks";
import { createBlockRegistry, createPatternRegistry } from "@plumix/blocks";

import { BlockScopePicker } from "./BlockScopePicker.js";

afterEach(() => {
  cleanup();
});

const blocks = createBlockRegistry([]);
const patterns = createPatternRegistry([]);

const twoUp: BlockVariation = {
  slug: "two-up",
  title: "Two up",
  description: "Two equal columns",
  attrs: { layout: "split" },
  scope: ["block"],
};

const threeUp: BlockVariation = {
  slug: "three-up",
  title: "Three up",
  description: "Three equal columns",
  attrs: { layout: "three" },
  scope: ["block"],
};

describe("BlockScopePicker", () => {
  test("renders one card per variation with title and description", () => {
    render(
      <BlockScopePicker
        blockTitle="Columns"
        parentBlockName="core/columns"
        variations={[twoUp, threeUp]}
        blocks={blocks}
        patterns={patterns}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByTestId("plumix-block-scope-picker")).toBeDefined();
    expect(
      screen.getByTestId("plumix-block-scope-picker-card-two-up"),
    ).toBeDefined();
    expect(
      screen.getByTestId("plumix-block-scope-picker-card-three-up"),
    ).toBeDefined();
  });

  test("renders a live thumbnail for each card keyed on parent + slug", () => {
    render(
      <BlockScopePicker
        blockTitle="Columns"
        parentBlockName="core/columns"
        variations={[twoUp, threeUp]}
        blocks={blocks}
        patterns={patterns}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("plumix-variation-thumbnail-core/columns:two-up"),
    ).toBeDefined();
    expect(
      screen.getByTestId("plumix-variation-thumbnail-core/columns:three-up"),
    ).toBeDefined();
  });

  test("clicking a card calls onSelect with the chosen variation", async () => {
    const onSelect = vi.fn();
    render(
      <BlockScopePicker
        blockTitle="Columns"
        parentBlockName="core/columns"
        variations={[twoUp, threeUp]}
        blocks={blocks}
        patterns={patterns}
        onSelect={onSelect}
        onDismiss={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByTestId("plumix-block-scope-picker-card-three-up"),
    );
    expect(onSelect).toHaveBeenCalledWith(threeUp);
  });

  test("clicking the cancel link calls onDismiss", async () => {
    const onDismiss = vi.fn();
    render(
      <BlockScopePicker
        blockTitle="Columns"
        parentBlockName="core/columns"
        variations={[twoUp]}
        blocks={blocks}
        patterns={patterns}
        onSelect={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    await userEvent.click(
      screen.getByTestId("plumix-block-scope-picker-cancel"),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
