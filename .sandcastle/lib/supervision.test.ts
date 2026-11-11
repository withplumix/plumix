import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import type { PullRequestSnapshot } from "./verdict.js";
import { ShipHistory } from "./ship-history.js";
import { inspectDelivery, supervisePullRequest } from "./supervision.js";

const roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true })),
);

function history(): ShipHistory {
  const root = mkdtempSync(join(tmpdir(), "ship-supervision-"));
  roots.push(root);
  return new ShipHistory(root);
}

const queued = {
  ticket: { number: 1, title: "fix" },
  pullRequest: { number: 101, url: "pr/101" },
};
const snapshot = (
  over: Partial<PullRequestSnapshot> = {},
): PullRequestSnapshot => ({
  state: "OPEN",
  headSha: "abc",
  mergeStateStatus: "BLOCKED",
  statusCheckRollup: [{ name: "Test", status: "IN_PROGRESS" }],
  isInMergeQueue: false,
  autoMergeEnabled: true,
  openCodeScanningAlerts: [],
  unresolvedReviewThreads: [],
  changesRequestedBy: [],
  requiredChecks: ["Test"],
  ...over,
});

describe("inspectDelivery", () => {
  test("no checks at all is a missing-check observation", () => {
    const journal = history();
    const missing = snapshot({ statusCheckRollup: [] });
    inspectDelivery(queued, missing, journal, 0);
    inspectDelivery(queued, missing, journal, 120_000);
    const action = inspectDelivery(queued, missing, journal, 240_000);
    expect(action).toMatchObject({
      type: "wait",
      reason: expect.stringContaining("Test never ran"),
    });
  });
  test("a dropped merge group is repaired from its evidence rather than endlessly requeued", async () => {
    const journal = history();
    let now = 0;
    const outcome = await supervisePullRequest(queued, journal, {
      inspect: () =>
        snapshot({
          autoMergeEnabled: false,
          statusCheckRollup: [
            { name: "Test", conclusion: "SUCCESS", status: "COMPLETED" },
          ],
        }),
      now: () => now,
      pause: async (ms) => {
        now += ms;
        if (now > 240_000) throw new Error("looped");
      },
      requeue: () => {
        throw new Error("must not requeue a failed merge group");
      },
      queueFailures: () => [{ name: "Test", url: "job/1" }],
      say: () => {},
    });

    expect(outcome).toMatchObject({
      status: "failed",
      headSha: "abc",
      fromTheMergeGroup: true,
      failingChecks: [{ name: "Test", url: "job/1" }],
    });
  });

  test("restart honors the recorded inspection time before reading GitHub again", async () => {
    const journal = history();
    inspectDelivery(queued, snapshot(), journal, 10_000);
    let now = 10_000;
    const pauses: number[] = [];
    const restarted = new ShipHistory(join(journal.path, "..", "..", ".."));

    const outcome = await supervisePullRequest(queued, restarted, {
      inspect: () => snapshot({ state: "MERGED" }),
      now: () => now,
      pause: async (ms) => {
        pauses.push(ms);
        now += ms;
      },
      requeue: () => {},
      queueFailures: () => [],
      say: () => {},
    });

    expect(pauses).toEqual([120_000]);
    expect(outcome).toEqual({ status: "merged" });
  });

  test("a clean PR whose queue request was lost is requeued instead of sent to a coding agent", () => {
    const journal = history();
    const unqueued = snapshot({
      autoMergeEnabled: false,
      statusCheckRollup: [
        { name: "Test", status: "COMPLETED", conclusion: "SUCCESS" },
      ],
    });
    inspectDelivery(queued, unqueued, journal, 0);

    const action = inspectDelivery(queued, unqueued, journal, 120_000);

    expect(action).toEqual({ type: "requeue" });
  });

  test("missing required checks survive restart and become a named human decision", () => {
    const journal = history();
    const missing = snapshot({
      statusCheckRollup: [
        { name: "Lint", conclusion: "SUCCESS", status: "COMPLETED" },
      ],
    });
    inspectDelivery(queued, missing, journal, 0);
    inspectDelivery(queued, missing, journal, 120_000);
    const restarted = new ShipHistory(join(journal.path, "..", "..", ".."));

    const action = inspectDelivery(queued, missing, restarted, 240_000);

    expect(action).toMatchObject({
      type: "wait",
      reason: expect.stringContaining("Test never ran"),
    });
    expect(restarted.observation(101)?.missingChecks).toBe(3);
  });

  test("a human approval decision waits without spending a repair", () => {
    const action = inspectDelivery(
      queued,
      snapshot({ statusCheckRollup: [], changesRequestedBy: ["owner"] }),
      history(),
      10_000,
    );

    expect(action).toMatchObject({
      type: "wait",
      until: 130_000,
      reason: expect.stringContaining("owner requested changes"),
    });
  });

  test("a failed current-head check is handed to repair with the observed head", () => {
    const action = inspectDelivery(
      queued,
      snapshot({
        statusCheckRollup: [
          { name: "Test", conclusion: "FAILURE", status: "COMPLETED" },
        ],
      }),
      history(),
      10_000,
    );

    expect(action).toEqual({
      type: "finish",
      outcome: {
        status: "failed",
        headSha: "abc",
        reason: "failing checks: Test",
        failingChecks: [
          { name: "Test", conclusion: "FAILURE", url: undefined },
        ],
      },
    });
  });

  test("a merged PR finishes instead of waiting again", () => {
    const action = inspectDelivery(
      queued,
      snapshot({ state: "MERGED" }),
      history(),
      10_000,
    );

    expect(action).toEqual({ type: "finish", outcome: { status: "merged" } });
  });

  test("pending CI schedules another inspection without a repair deadline", () => {
    const journal = history();

    const action = inspectDelivery(queued, snapshot(), journal, 10_000);

    expect(action).toEqual({
      type: "wait",
      until: 130_000,
      reason: "checks or merge queue pending",
    });
    expect(journal.observation(101)).toMatchObject({
      headSha: "abc",
      nextCheckAt: 130_000,
    });
  });
});
