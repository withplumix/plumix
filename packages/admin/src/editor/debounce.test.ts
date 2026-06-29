import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createDebouncer } from "./debounce.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createDebouncer", () => {
  test("invokes fn once after the delay elapses from the last call", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, 300);

    d.call("a");
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");
  });

  test("coalesces rapid calls into one trailing-edge invocation with the latest args", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, 300);

    d.call("a");
    vi.advanceTimersByTime(100);
    d.call("b");
    vi.advanceTimersByTime(100);
    d.call("c");
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });

  test("flush invokes fn immediately with the pending args and cancels the timer", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, 300);

    d.call("a");
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("flush is a no-op when no call is pending", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, 300);

    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  test("flush resolves only once the async fn settles, so callers can await persistence", async () => {
    let resolveFn: (() => void) | undefined;
    const fn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const d = createDebouncer(fn, 300);

    d.call();
    let settled = false;
    const flushed = d.flush().then(() => {
      settled = true;
    });

    // The fn started but hasn't resolved — flush must still be pending.
    expect(fn).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveFn?.();
    await flushed;
    expect(settled).toBe(true);
  });

  test("flush resolves immediately when idle", async () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, 300);

    await expect(d.flush()).resolves.toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
  });

  test("cancel prevents fn from firing", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, 300);

    d.call("a");
    d.cancel();
    vi.advanceTimersByTime(300);

    expect(fn).not.toHaveBeenCalled();
  });
});
