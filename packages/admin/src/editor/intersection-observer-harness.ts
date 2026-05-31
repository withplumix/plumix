import { act } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

interface ObservedEntry {
  readonly callback: IntersectionObserverCallback;
  readonly target: Element;
}

interface IntersectionObserverHarness {
  intersect: () => void;
}

// Call at module top-level — the fixture registers its own `beforeEach` /
// `afterEach`, which vitest only accepts outside a running test. Not
// safe under `test.concurrent`: `observations` is file-scoped, so two
// tests running in parallel would share one observer queue.
export function installFakeIntersectionObserver(): IntersectionObserverHarness {
  const observations: ObservedEntry[] = [];

  beforeEach(() => {
    observations.length = 0;
    class FakeObserver {
      constructor(public readonly callback: IntersectionObserverCallback) {}
      observe = (target: Element): void => {
        observations.push({ callback: this.callback, target });
      };
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn((): IntersectionObserverEntry[] => []);
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  return {
    intersect: () => {
      act(() => {
        for (const { callback, target } of observations) {
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
    },
  };
}
