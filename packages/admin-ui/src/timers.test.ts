import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createDebouncedValue, createTimedFlag } from "./timers.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createTimedFlag", () => {
  test("a second trigger keeps the flag on until the delay has passed since it", () => {
    const states: boolean[] = [];
    const flag = createTimedFlag(1000, (on) => states.push(on));
    flag.trigger();
    vi.advanceTimersByTime(600);

    flag.trigger();
    vi.advanceTimersByTime(999);

    expect(states).toEqual([true, true]);
    vi.advanceTimersByTime(1);
    expect(states).toEqual([true, true, false]);
  });

  test("cancelling leaves no pending reset to fire after unmount", () => {
    const states: boolean[] = [];
    const flag = createTimedFlag(1000, (on) => states.push(on));
    flag.trigger();

    flag.cancel();
    vi.advanceTimersByTime(1000);

    expect(states).toEqual([true]);
  });

  test("resetting turns the flag off at once", () => {
    const states: boolean[] = [];
    const flag = createTimedFlag(1000, (on) => states.push(on));
    flag.trigger();

    flag.reset();

    expect(states).toEqual([true, false]);
  });

  test("resetting drops the pending reset", () => {
    const states: boolean[] = [];
    const flag = createTimedFlag(1000, (on) => states.push(on));
    flag.trigger();

    flag.reset();
    vi.advanceTimersByTime(1000);

    expect(states).toEqual([true, false]);
  });
});

describe("createDebouncedValue", () => {
  test("settles on the last value once the delay has passed since it was pushed", () => {
    const settled: string[] = [];
    const debounced = createDebouncedValue(250, (value: string) =>
      settled.push(value),
    );
    debounced.push("a");
    vi.advanceTimersByTime(200);

    debounced.push("ab");
    vi.advanceTimersByTime(249);

    expect(settled).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(settled).toEqual(["ab"]);
  });

  test("cancelling leaves no pending value to settle after unmount", () => {
    const settled: string[] = [];
    const debounced = createDebouncedValue(250, (value: string) =>
      settled.push(value),
    );
    debounced.push("a");

    debounced.cancel();
    vi.advanceTimersByTime(250);

    expect(settled).toEqual([]);
  });
});
