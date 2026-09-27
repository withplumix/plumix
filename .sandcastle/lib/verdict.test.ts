import { describe, expect, test } from "vitest";

import type { PullRequestSnapshot } from "./verdict.js";
import { judgeQueuedPullRequest } from "./verdict.js";

const snapshot = (
  over: Partial<PullRequestSnapshot> = {},
): PullRequestSnapshot => ({
  state: "OPEN",
  mergeStateStatus: "BLOCKED",
  statusCheckRollup: [],
  isInMergeQueue: true,
  autoMergeEnabled: false,
  openCodeScanningAlerts: [],
  ...over,
});

const run = (name: string, conclusion: string, status = "COMPLETED") => ({
  name,
  conclusion,
  status,
  detailsUrl: `https://github.com/o/r/actions/runs/1/job/${name.length}`,
});

describe("judgeQueuedPullRequest", () => {
  test("a merged pull request is merged", () => {
    expect(judgeQueuedPullRequest(snapshot({ state: "MERGED" }))).toEqual({
      status: "merged",
    });
  });

  test("a pull request in the queue is waited on", () => {
    expect(judgeQueuedPullRequest(snapshot()).status).toBe("waiting");
  });

  test("a conflicted branch is refused as conflicted", () => {
    const verdict = judgeQueuedPullRequest(
      snapshot({ mergeStateStatus: "DIRTY", isInMergeQueue: false }),
    );

    expect(verdict).toMatchObject({ status: "failed", conflicted: true });
  });

  test("a failing check is refused with the link to its log, so a fixer can read what CI saw", () => {
    const verdict = judgeQueuedPullRequest(
      snapshot({
        statusCheckRollup: [run("Knip", "FAILURE"), run("Lint", "SUCCESS")],
      }),
    );

    expect(verdict).toMatchObject({
      status: "failed",
      failingChecks: [{ name: "Knip", url: expect.stringContaining("/job/") }],
    });
  });

  test("a pull request blocked only by code scanning is refused with the alerts, not left to time out", () => {
    const verdict = judgeQueuedPullRequest(
      snapshot({
        isInMergeQueue: false,
        statusCheckRollup: [run("Lint", "SUCCESS")],
        openCodeScanningAlerts: ["Improper code sanitization at a.ts:18"],
      }),
    );

    expect(verdict).toMatchObject({
      status: "failed",
      codeScanningAlerts: ["Improper code sanitization at a.ts:18"],
    });
  });

  test("code scanning is not judged while checks are still running", () => {
    const verdict = judgeQueuedPullRequest(
      snapshot({
        isInMergeQueue: false,
        autoMergeEnabled: true,
        statusCheckRollup: [run("Analyze", "", "IN_PROGRESS")],
        openCodeScanningAlerts: ["stale alert"],
      }),
    );

    expect(verdict.status).toBe("waiting");
  });

  test("an open pull request neither queued nor set to auto-merge has been dropped by the queue", () => {
    const verdict = judgeQueuedPullRequest(
      snapshot({
        mergeStateStatus: "CLEAN",
        isInMergeQueue: false,
        autoMergeEnabled: false,
        statusCheckRollup: [run("Lint", "SUCCESS")],
      }),
    );

    expect(verdict.status).toBe("left-the-queue");
  });

  test("a pull request waiting on auto-merge has not left the queue", () => {
    const verdict = judgeQueuedPullRequest(
      snapshot({ isInMergeQueue: false, autoMergeEnabled: true }),
    );

    expect(verdict.status).toBe("waiting");
  });
});
