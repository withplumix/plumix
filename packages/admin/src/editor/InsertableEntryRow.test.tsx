import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { InsertableBlockEntry } from "@plumix/blocks";
import { createBlockRegistry, createPatternRegistry } from "@plumix/blocks";

import { InsertableEntryRow } from "./InsertableEntryRow.js";

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

describe("InsertableEntryRow", () => {
  test("renders a plain block as a single-line row without a thumbnail", () => {
    const entry: InsertableBlockEntry = {
      name: "core/heading",
      slug: "core/heading",
      title: "Heading",
      icon: "Heading",
    };
    render(
      <InsertableEntryRow
        entry={entry}
        blocks={blocks}
        patterns={patterns}
        onClick={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("plumix-blocks-tab-item-core/heading"),
    ).toBeDefined();
    expect(
      screen.queryByTestId(
        "plumix-blocks-tab-thumbnail-placeholder-core/heading",
      ),
    ).toBeNull();
  });

  test("renders a variation as a two-line card with a lazy-mounted thumbnail placeholder", () => {
    const entry: InsertableBlockEntry = {
      name: "core/list",
      slug: "bullet",
      title: "Bulleted list",
      attrs: { variant: "bullet" },
    };
    render(
      <InsertableEntryRow
        entry={entry}
        blocks={blocks}
        patterns={patterns}
        onClick={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId(
        "plumix-blocks-tab-thumbnail-placeholder-core/list:bullet",
      ),
    ).toBeDefined();
    intersect();
    expect(
      screen.getByTestId("plumix-variation-thumbnail-core/list:bullet"),
    ).toBeDefined();
  });
});
