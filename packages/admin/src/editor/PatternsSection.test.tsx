import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createBlockRegistry, createPatternRegistry } from "@plumix/blocks";

import { PatternsSection } from "./PatternsSection.js";

interface QueuedObserver {
  readonly callback: IntersectionObserverCallback;
  readonly target: Element;
}

let observers: QueuedObserver[];

beforeEach(() => {
  observers = [];
  class FakeObserver {
    constructor(public readonly callback: IntersectionObserverCallback) {}
    observe = (target: Element): void => {
      observers.push({ callback: this.callback, target });
    };
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

// Flushes every queued observer with an intersecting entry — mirrors
// the pattern in LazyMount.test.tsx so React state updates land inside
// act() and the warning-free assertion path is consistent.
function intersectAll(): void {
  act(() => {
    for (const { callback, target } of observers) {
      const entry = {
        isIntersecting: true,
        intersectionRatio: 1,
        target,
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
        time: 0,
      } satisfies IntersectionObserverEntry;
      callback([entry], null as unknown as IntersectionObserver);
    }
  });
}

const noop = vi.fn();
const blocks = createBlockRegistry([]);
const patterns = createPatternRegistry([]);

describe("PatternsSection", () => {
  test("renders nothing when no patterns are registered", () => {
    const { container } = render(
      <PatternsSection
        patterns={[]}
        onSelect={noop}
        blocks={blocks}
        patternRegistry={patterns}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("renders title rows for each pattern, grouped under category headers", () => {
    render(
      <PatternsSection
        onSelect={noop}
        blocks={blocks}
        patternRegistry={patterns}
        patterns={[
          {
            name: "starter/hero",
            title: "Hero CTA",
            category: "hero",
            content: [],
          },
          {
            name: "starter/big-cta",
            title: "Big CTA",
            category: "cta",
            content: [],
          },
          {
            name: "starter/min-hero",
            title: "Minimal Hero",
            category: "hero",
            content: [],
          },
        ]}
      />,
    );

    expect(screen.getByTestId("plumix-patterns-section")).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-patterns-group-hero"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("plumix-patterns-group-cta")).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-patterns-row-starter/hero"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-patterns-row-starter/big-cta"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-patterns-row-starter/min-hero"),
    ).toBeInTheDocument();
  });

  test("patterns without a category fall under an 'uncategorized' group", () => {
    render(
      <PatternsSection
        onSelect={noop}
        blocks={blocks}
        patternRegistry={patterns}
        patterns={[{ name: "x/anon", title: "Anonymous", content: [] }]}
      />,
    );

    expect(
      screen.getByTestId("plumix-patterns-group-uncategorized"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-patterns-row-x/anon"),
    ).toBeInTheDocument();
  });

  test("renders a thumbnail card for each pattern after the row intersects the viewport", () => {
    const hero = {
      name: "starter/hero",
      title: "Hero",
      preview: {
        src: "/hero.png",
        width: 200,
        height: 120,
        alt: "Hero preview",
      },
      content: [],
    };
    const cta = {
      name: "starter/cta",
      title: "CTA",
      preview: {
        src: "/cta.png",
        width: 200,
        height: 120,
        alt: "CTA preview",
      },
      content: [],
    };

    render(
      <PatternsSection
        patterns={[hero, cta]}
        onSelect={noop}
        blocks={blocks}
        patternRegistry={patterns}
      />,
    );

    // Pre-intersection: only placeholders, no thumbnails.
    expect(
      screen.queryByTestId(`plumix-pattern-thumbnail-${hero.name}`),
    ).toBeNull();
    expect(
      screen.getByTestId(`plumix-patterns-row-placeholder-${hero.name}`),
    ).toBeInTheDocument();

    intersectAll();

    expect(
      screen.getByTestId(`plumix-pattern-thumbnail-${hero.name}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`plumix-pattern-thumbnail-${cta.name}`),
    ).toBeInTheDocument();
  });

  test("clicking a pattern row invokes onSelect with the pattern entry", async () => {
    const onSelect = vi.fn();
    const hero = {
      name: "starter/hero",
      title: "Hero",
      category: "hero" as const,
      content: [],
    };
    render(
      <PatternsSection
        patterns={[hero]}
        onSelect={onSelect}
        blocks={blocks}
        patternRegistry={patterns}
      />,
    );

    await userEvent.click(
      screen.getByTestId("plumix-patterns-row-starter/hero"),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(hero);
  });
});
