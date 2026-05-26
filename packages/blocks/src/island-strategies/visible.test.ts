import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { PlumixIslandElement } from "../island-element.js";
import { visibleStrategy } from "./visible.js";

// Minimal IntersectionObserver double: records construction options and
// observed targets, and lets a test fire a synthetic intersection.
class FakeIO {
  static instances: FakeIO[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeIO.instances.push(this);
  }
  observe(el: Element): void {
    this.observed.push(el);
  }
  disconnect(): void {
    this.disconnected = true;
  }
  fire(isIntersecting: boolean): void {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

// jsdom's getBoundingClientRect returns all-zeros, so `isInViewport` is
// false by default and the observer path is taken. The already-visible test
// stubs the rect + viewport explicitly.
function makeEl(): PlumixIslandElement {
  return document.createElement("plumix-island") as PlumixIslandElement;
}

describe("visibleStrategy", () => {
  beforeEach(() => {
    FakeIO.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIO);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("observes the element and hydrates on first intersection", () => {
    const loadFn = vi.fn(() => Promise.resolve());
    const el = makeEl();

    void visibleStrategy(loadFn, {}, el);

    expect(FakeIO.instances).toHaveLength(1);
    const io = FakeIO.instances[0];
    expect(io?.observed).toEqual([el]);
    expect(loadFn).not.toHaveBeenCalled();

    // A non-intersecting entry must not trigger.
    io?.fire(false);
    expect(loadFn).not.toHaveBeenCalled();

    io?.fire(true);
    expect(loadFn).toHaveBeenCalledTimes(1);
    // Single-shot: disconnect on first hit so a re-entry can't double-fire.
    expect(io?.disconnected).toBe(true);
  });

  test("defaults rootMargin to 200px so the chunk warms before entering view", () => {
    void visibleStrategy(() => Promise.resolve(), {}, makeEl());
    expect(FakeIO.instances[0]?.options).toEqual({ rootMargin: "200px" });
  });

  test("honors an explicit `opts.rootMargin`", () => {
    void visibleStrategy(
      () => Promise.resolve(),
      { rootMargin: "0px" },
      makeEl(),
    );
    expect(FakeIO.instances[0]?.options).toEqual({ rootMargin: "0px" });
  });

  test("returns a teardown that disconnects the observer (no leak on early removal)", () => {
    const cleanup = visibleStrategy(() => Promise.resolve(), {}, makeEl());
    expect(typeof cleanup).toBe("function");
    (cleanup as () => void)();
    expect(FakeIO.instances[0]?.disconnected).toBe(true);
  });

  test("hydrates immediately and skips the observer when already in viewport", () => {
    const loadFn = vi.fn(() => Promise.resolve());
    const el = makeEl();
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      top: 10,
      left: 10,
      bottom: 110,
      right: 110,
      width: 100,
      height: 100,
    } as DOMRect);
    vi.stubGlobal("innerWidth", 1024);
    vi.stubGlobal("innerHeight", 768);

    void visibleStrategy(loadFn, {}, el);

    expect(loadFn).toHaveBeenCalledTimes(1);
    expect(FakeIO.instances).toHaveLength(0);
  });
});
