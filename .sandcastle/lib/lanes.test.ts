import { describe, expect, test } from "vitest";

import { drainAcrossLanes } from "./lanes.js";

const settleAfter = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const neverEnough = () => false;

describe("drainAcrossLanes", () => {
  test("every item is handed to exactly one lane", async () => {
    const seen: number[] = [];

    await drainAcrossLanes({
      items: [1, 2, 3, 4, 5, 6, 7],
      lanes: 3,
      inLane: async (item) => {
        seen.push(item);
        return item;
      },
      stopDispatchingWhen: neverEnough,
    });

    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("no more than the configured number of lanes run at once", async () => {
    let inFlight = 0;
    let busiest = 0;

    await drainAcrossLanes({
      items: [10, 10, 10, 10, 10, 10],
      lanes: 2,
      inLane: async (item) => {
        inFlight += 1;
        busiest = Math.max(busiest, inFlight);
        await settleAfter(item);
        inFlight -= 1;
        return item;
      },
      stopDispatchingWhen: neverEnough,
    });

    expect(busiest).toBe(2);
  });

  test("a slow item does not hold back the lane beside it", async () => {
    const finished: string[] = [];

    await drainAcrossLanes({
      items: [
        { name: "slow", ms: 60 },
        { name: "quick-a", ms: 1 },
        { name: "quick-b", ms: 1 },
        { name: "quick-c", ms: 1 },
      ],
      lanes: 2,
      inLane: async ({ name, ms }) => {
        await settleAfter(ms);
        finished.push(name);
        return name;
      },
      stopDispatchingWhen: neverEnough,
    });

    expect(finished.at(-1)).toBe("slow");
  });

  test("dispatching stops once enough has settled, leaving the rest untouched", async () => {
    const seen: number[] = [];

    const settled = await drainAcrossLanes({
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      lanes: 1,
      inLane: async (item) => {
        seen.push(item);
        return item;
      },
      stopDispatchingWhen: (done) => done.length >= 3,
    });

    expect(seen).toEqual([1, 2, 3]);
    expect(settled).toHaveLength(3);
  });

  test("work already in flight when the stop trips is still collected", async () => {
    const settled = await drainAcrossLanes({
      items: [1, 2, 3, 4],
      lanes: 4,
      inLane: async (item) => {
        await settleAfter(5);
        return item;
      },
      stopDispatchingWhen: (done) => done.length >= 1,
    });

    expect(settled).toHaveLength(4);
  });

  test("more lanes than items starts no lane with nothing to do", async () => {
    let lanesUsed = 0;

    await drainAcrossLanes({
      items: [1, 2],
      lanes: 8,
      inLane: async (item, lane) => {
        lanesUsed = Math.max(lanesUsed, lane + 1);
        return item;
      },
      stopDispatchingWhen: neverEnough,
    });

    expect(lanesUsed).toBeLessThanOrEqual(2);
  });

  test("an empty queue settles without starting a lane", async () => {
    const settled = await drainAcrossLanes({
      items: [],
      lanes: 4,
      inLane: async () => {
        throw new Error("no lane should have started");
      },
      stopDispatchingWhen: neverEnough,
    });

    expect(settled).toEqual([]);
  });
});
