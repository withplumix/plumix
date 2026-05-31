import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { BlockVariation } from "@plumix/blocks";
import { createBlockRegistry, createPatternRegistry } from "@plumix/blocks";

import { BlockScopePicker } from "./BlockScopePicker.js";

interface FakeObserverHandle {
  readonly callback: IntersectionObserverCallback;
}

let observers: FakeObserverHandle[];

beforeEach(() => {
  observers = [];
  class FakeObserver {
    constructor(public readonly callback: IntersectionObserverCallback) {
      observers.push({ callback });
    }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn((): IntersectionObserverEntry[] => []);
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function intersect(): void {
  const entry = {
    isIntersecting: true,
    intersectionRatio: 1,
    target: document.createElement("div"),
    boundingClientRect: {} as DOMRectReadOnly,
    intersectionRect: {} as DOMRectReadOnly,
    rootBounds: null,
    time: 0,
  } satisfies IntersectionObserverEntry;
  act(() => {
    for (const o of observers) o.callback([entry], {} as IntersectionObserver);
  });
}

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

  test("renders a placeholder for each thumbnail before the card scrolls into view", () => {
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
      screen.getByTestId(
        "plumix-block-scope-picker-thumbnail-placeholder-core/columns:two-up",
      ),
    ).toBeDefined();
    expect(
      screen.queryByTestId("plumix-variation-thumbnail-core/columns:two-up"),
    ).toBeNull();
  });

  test("mounts the live thumbnail once the placeholder intersects the viewport", () => {
    render(
      <BlockScopePicker
        blockTitle="Columns"
        parentBlockName="core/columns"
        variations={[twoUp]}
        blocks={blocks}
        patterns={patterns}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("plumix-variation-thumbnail-core/columns:two-up"),
    ).toBeNull();
    intersect();
    expect(
      screen.getByTestId("plumix-variation-thumbnail-core/columns:two-up"),
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
