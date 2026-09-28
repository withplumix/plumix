import { describe, expect, test } from "vitest";

import { untilTheRunCompletes } from "./run-completion.js";

const statuses = (...sequence: string[]) => {
  let polls = 0;
  return {
    statusOf: () => sequence[Math.min(polls++, sequence.length - 1)] ?? "",
    polls: () => polls,
  };
};

describe("untilTheRunCompletes", () => {
  test("waits for a run still in progress, because its logs are served only once it completes", async () => {
    const run = statuses("in_progress", "in_progress", "completed");

    const completed = await untilTheRunCompletes(run.statusOf, async () => {}, {
      attempts: 10,
    });

    expect(completed).toBe(true);
    expect(run.polls()).toBe(3);
  });

  test("gives up after its attempts, so a stuck run cannot hold the repair", async () => {
    const run = statuses("in_progress");

    const completed = await untilTheRunCompletes(run.statusOf, async () => {}, {
      attempts: 4,
    });

    expect(completed).toBe(false);
    expect(run.polls()).toBe(4);
  });
});
