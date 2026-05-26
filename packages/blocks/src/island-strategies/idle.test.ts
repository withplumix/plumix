import { afterEach, describe, expect, test, vi } from "vitest";

import type { PlumixIslandElement } from "../island-element.js";
import { idleStrategy } from "./idle.js";

// The strategy only touches `loadFn` and `opts`; the element arg is unused.
const EL = {} as PlumixIslandElement;

describe("idleStrategy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("hydrates inside a requestIdleCallback slot, capped at 2000ms by default", () => {
    const ric = vi.fn();
    vi.stubGlobal("requestIdleCallback", ric);
    const loadFn = vi.fn(() => Promise.resolve());

    void idleStrategy(loadFn, {}, EL);

    expect(ric).toHaveBeenCalledTimes(1);
    expect(ric.mock.calls[0]?.[1]).toEqual({ timeout: 2000 });
    // The slot callback, not loadFn, is scheduled — loadFn fires when it runs.
    expect(loadFn).not.toHaveBeenCalled();
    (ric.mock.calls[0]?.[0] as () => void)();
    expect(loadFn).toHaveBeenCalledTimes(1);
  });

  test("honors an explicit `opts.timeout` cap", () => {
    const ric = vi.fn();
    vi.stubGlobal("requestIdleCallback", ric);

    void idleStrategy(() => Promise.resolve(), { timeout: 500 }, EL);

    expect(ric.mock.calls[0]?.[1]).toEqual({ timeout: 500 });
  });

  test("falls back to setTimeout(200) when requestIdleCallback is absent", () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.useFakeTimers();
    const loadFn = vi.fn(() => Promise.resolve());

    void idleStrategy(loadFn, {}, EL);
    expect(loadFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(199);
    expect(loadFn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(loadFn).toHaveBeenCalledTimes(1);
  });
});
