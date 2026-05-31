import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { LazyMount } from "./LazyMount.js";

interface IOInit {
  readonly callback: IntersectionObserverCallback;
}

let observers: IOInit[];

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
    for (const o of observers) {
      o.callback(
        [entry],
        // The real type expects an IntersectionObserver instance; the
        // children don't read from it.
        null as unknown as IntersectionObserver,
      );
    }
  });
}

describe("LazyMount", () => {
  test("does not render children until the placeholder enters the viewport", () => {
    render(
      <LazyMount placeholderTestId="placeholder">
        <span data-testid="payload">payload</span>
      </LazyMount>,
    );

    expect(screen.queryByTestId("payload")).toBeNull();
    expect(screen.getByTestId("placeholder")).toBeInTheDocument();
  });

  test("renders children after the observer reports intersection", () => {
    render(
      <LazyMount placeholderTestId="placeholder">
        <span data-testid="payload">payload</span>
      </LazyMount>,
    );

    intersect();

    expect(screen.getByTestId("payload")).toBeInTheDocument();
  });
});
