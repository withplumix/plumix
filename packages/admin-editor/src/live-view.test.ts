import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { View } from "./canvas-view.js";
import { createLiveView } from "./live-view.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const at = (panY: number): View => ({ panX: 0, panY, zoom: 1 });

describe("createLiveView", () => {
  test("paints every view of a wheel burst as it arrives", () => {
    const painted: View[] = [];
    const live = createLiveView({
      apply: (view) => painted.push(view),
      commit: () => undefined,
      settleMs: 150,
    });

    live.move(at(-20));
    live.move(at(-40));
    live.move(at(-60));

    expect(painted).toEqual([at(-20), at(-40), at(-60)]);
  });

  test("commits a wheel burst once, with its last view, after it settles", () => {
    const committed: View[] = [];
    const live = createLiveView({
      apply: () => undefined,
      commit: (view) => committed.push(view),
      settleMs: 150,
    });
    live.move(at(-20));
    vi.advanceTimersByTime(100);
    live.move(at(-40));
    vi.advanceTimersByTime(100);
    live.move(at(-60));

    vi.advanceTimersByTime(150);

    expect(committed).toEqual([at(-60)]);
  });

  test("commits nothing while the burst keeps arriving", () => {
    const committed: View[] = [];
    const live = createLiveView({
      apply: () => undefined,
      commit: (view) => committed.push(view),
      settleMs: 150,
    });
    live.move(at(-20));
    vi.advanceTimersByTime(100);

    live.move(at(-40));
    vi.advanceTimersByTime(100);

    expect(committed).toEqual([]);
  });
});
