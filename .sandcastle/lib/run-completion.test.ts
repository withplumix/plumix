import { describe, expect, test } from "vitest";

import {
  rerunOnceTheRunsFinish,
  untilTheRunCompletes,
} from "./run-completion.js";

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

describe("rerunOnceTheRunsFinish", () => {
  test("a run whose other jobs are still going is re-run once it completes, which GitHub refuses before", async () => {
    const run = statuses("in_progress", "in_progress", "completed");
    const reran: string[] = [];

    const started = await rerunOnceTheRunsFinish(["36611705705"], {
      statusOf: run.statusOf,
      rerun: (runId) => {
        reran.push(`${runId}@${run.polls()}`);
        return true;
      },
      pause: async () => {},
      attempts: 10,
    });

    expect(started).toBe(true);
    expect(reran).toEqual(["36611705705@3"]);
  });

  test("a run that never completes is not re-run", async () => {
    const reran: string[] = [];

    const started = await rerunOnceTheRunsFinish(["1"], {
      statusOf: () => "in_progress",
      rerun: (runId) => {
        reran.push(runId);
        return true;
      },
      pause: async () => {},
      attempts: 3,
    });

    expect(started).toBe(false);
    expect(reran).toEqual([]);
  });
});
