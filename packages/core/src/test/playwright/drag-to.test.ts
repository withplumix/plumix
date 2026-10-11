import type { Locator, Page } from "@playwright/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { dragTo } from "./drag-to.js";

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Answers each `boundingBox()` with the next read, then repeats the last. */
function fakeLocator(...reads: readonly (Box | null)[]): Locator {
  const pending = [...reads];
  return {
    boundingBox: () =>
      Promise.resolve(pending.length > 1 ? pending.shift() : pending[0]),
  } as unknown as Locator;
}

function fakePage(): { page: Page; events: string[] } {
  const events: string[] = [];
  const page = {
    mouse: {
      move: (x: number, y: number, options?: { steps?: number }) => {
        events.push(
          `move ${String(x)},${String(y)} in ${String(options?.steps ?? 1)}`,
        );
        return Promise.resolve();
      },
      down: () => {
        events.push("down");
        return Promise.resolve();
      },
      up: () => {
        events.push("up");
        return Promise.resolve();
      },
    },
  } as unknown as Page;
  return { page, events };
}

/** Lets `toPass` sleep between reads on the fake clock instead of the real one. */
async function drag(...args: Parameters<typeof dragTo>): Promise<void> {
  const dragging = dragTo(...args);
  await vi.advanceTimersByTimeAsync(2_000);
  await dragging;
}

describe("dragTo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("presses on the settled source and releases on the settled target", async () => {
    const { page, events } = fakePage();
    const source = fakeLocator(null, { x: 10, y: 20, width: 40, height: 20 });
    const target = fakeLocator(
      { x: 300, y: 0, width: 100, height: 50 },
      { x: 300, y: 0, width: 100, height: 50 },
      { x: 300, y: 400, width: 100, height: 50 },
    );

    await drag(page, source, target);

    expect(events).toEqual([
      "move 30,30 in 1",
      "down",
      "move 350,425 in 10",
      "up",
    ]);
  });

  test("runs beforeDrop at the target with the button held, before the release", async () => {
    const { page, events } = fakePage();
    const box = { x: 0, y: 0, width: 20, height: 20 };

    await drag(page, fakeLocator(box), fakeLocator(box), {
      beforeDrop: () => {
        events.push("beforeDrop");
        return Promise.resolve();
      },
    });

    expect(events).toEqual([
      "move 10,10 in 1",
      "down",
      "move 10,10 in 10",
      "beforeDrop",
      "up",
    ]);
  });

  test("presses and releases at points relative to each box's top-left", async () => {
    const { page, events } = fakePage();
    const strip = { x: 100, y: 50, width: 200, height: 20 };

    await drag(page, fakeLocator(strip), fakeLocator(strip), {
      sourcePosition: () => ({ x: 5, y: 5 }),
      targetPosition: (box) => ({
        x: box.width / 2 - 160,
        y: box.height / 2 + 120,
      }),
      steps: 15,
    });

    expect(events).toEqual([
      "move 105,55 in 1",
      "down",
      "move 40,180 in 15",
      "up",
    ]);
  });
});
