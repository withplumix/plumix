import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  postMergeQuality,
  postMergeQualityReport,
} from "./post-merge-quality.js";
import { ShipHistory } from "./ship-history.js";

const squashed = (
  at: string,
  message: string,
  files: readonly string[],
): string => `\x1e${at}\x1f${message}\n\x1f\n\n${files.join("\n")}\n`;

const NO_QUALITY_ISSUES = { merged: 0, reverted: 0, followUpFixes: 0 };

describe("postMergeQuality", () => {
  test("a merged loop-owned PR counts for the loop and every other PR for the baseline", () => {
    const log = [
      squashed("2026-10-02T10:00:00Z", "feat: add a (#10)", ["a.ts"]),
      squashed("2026-10-03T10:00:00Z", "feat: add b (#11)", ["b.ts"]),
      squashed("2026-10-04T10:00:00Z", "chore: add c (#12)", ["c.ts"]),
    ].join("");

    expect(postMergeQuality(log, new Set([10]), ["2026-10"])).toEqual([
      {
        month: "2026-10",
        loop: { ...NO_QUALITY_ISSUES, merged: 1 },
        other: { ...NO_QUALITY_ISSUES, merged: 2 },
      },
    ]);
  });

  test("a later revert commit that names the PR in its quoted subject marks it reverted", () => {
    const log = [
      squashed("2026-10-02T10:00:00Z", "feat: add a (#10)", ["a.ts"]),
      squashed("2026-11-20T10:00:00Z", 'Revert "feat: add a (#10)" (#11)', [
        "a.ts",
      ]),
    ].join("");

    expect(postMergeQuality(log, new Set([10]), ["2026-10"])[0]?.loop).toEqual({
      merged: 1,
      reverted: 1,
      followUpFixes: 0,
    });
  });

  test("a revert squashed from GitHub's revert button names the PR in its body", () => {
    const log = [
      squashed("2026-10-02T10:00:00Z", "feat: add a (#10)", ["a.ts"]),
      squashed(
        "2026-10-03T10:00:00Z",
        'Revert "feat: add a" (#11)\n\nReverts withplumix/plumix#10',
        ["a.ts"],
      ),
    ].join("");

    expect(postMergeQuality(log, new Set([10]), ["2026-10"])[0]?.loop).toEqual({
      merged: 1,
      reverted: 1,
      followUpFixes: 0,
    });
  });

  test("reverting the revert puts the PR back, so it no longer counts as reverted", () => {
    const log = [
      squashed("2026-10-02T10:00:00Z", "feat: add a (#10)", ["a.ts"]),
      squashed("2026-10-03T10:00:00Z", 'Revert "feat: add a (#10)" (#11)', [
        "a.ts",
      ]),
      squashed(
        "2026-10-04T10:00:00Z",
        'Revert "Revert "feat: add a (#10)" (#11)" (#12)',
        ["a.ts"],
      ),
    ].join("");

    expect(postMergeQuality(log, new Set([10]), ["2026-10"])[0]).toEqual({
      month: "2026-10",
      loop: { merged: 1, reverted: 0, followUpFixes: 0 },
      other: { merged: 2, reverted: 1, followUpFixes: 0 },
    });
  });

  test("a fix within 7 days that touches only some of the PR's files is a follow-up fix", () => {
    const log = [
      squashed("2026-10-02T10:00:00Z", "feat: add a (#10)", ["a.ts", "b.ts"]),
      squashed("2026-10-09T09:00:00Z", "fix(core): mend b (#11)", [
        "b.ts",
        "c.ts",
      ]),
    ].join("");

    expect(postMergeQuality(log, new Set([10]), ["2026-10"])[0]?.loop).toEqual({
      merged: 1,
      reverted: 0,
      followUpFixes: 1,
    });
  });

  test.each([
    [
      "merged before the PR",
      "2026-10-01T10:00:00Z",
      "fix: mend a (#9)",
      ["a.ts"],
    ],
    [
      "more than 7 days after the merge",
      "2026-10-09T10:00:01Z",
      "fix: mend a (#11)",
      ["a.ts"],
    ],
    [
      "touching none of the PR's files",
      "2026-10-03T10:00:00Z",
      "fix: mend c (#11)",
      ["c.ts"],
    ],
    [
      "of a type other than fix",
      "2026-10-03T10:00:00Z",
      "feat: extend a (#11)",
      ["a.ts"],
    ],
  ])("a commit %s is not a follow-up fix", (_case, at, subject, files) => {
    const log = [
      squashed("2026-10-02T10:00:00Z", "feat: add a (#10)", ["a.ts"]),
      squashed(at, subject, files),
    ].join("");

    expect(postMergeQuality(log, new Set([10]), ["2026-10"])[0]?.loop).toEqual({
      merged: 1,
      reverted: 0,
      followUpFixes: 0,
    });
  });

  test("a PR counts in the UTC month it merged in", () => {
    const log = squashed("2026-11-01T00:30:00+01:00", "feat: add a (#10)", [
      "a.ts",
    ]);

    expect(
      postMergeQuality(log, new Set([10]), ["2026-10", "2026-11"]).map(
        ({ month, loop }) => [month, loop.merged],
      ),
    ).toEqual([
      ["2026-10", 1],
      ["2026-11", 0],
    ]);
  });
});

describe("postMergeQualityReport", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "post-merge-quality-"));
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    rmSync(root, { recursive: true });
  });

  const journalTracking = (at: string, pullRequest: number): void => {
    vi.setSystemTime(new Date(at));
    const history = new ShipHistory(root);
    history.record({
      type: "pr.tracked",
      ticket: { number: 1, title: "add a" },
      pullRequest: {
        number: pullRequest,
        url: `https://github.com/o/r/pull/${pullRequest}`,
      },
    });
    history.record({ type: "delivery.merged", issue: 1 });
  };

  const OCTOBER_HISTORY = [
    squashed("2026-10-02T10:00:00Z", "feat: add a (#10)", ["a.ts"]),
    squashed("2026-10-03T10:00:00Z", "feat: add b (#11)", ["b.ts"]),
    squashed("2026-10-04T10:00:00Z", "fix: mend b (#12)", ["b.ts"]),
    squashed("2026-10-05T10:00:00Z", 'Revert "feat: add a (#10)" (#13)', [
      "a.ts",
    ]),
  ].join("");

  test("prints six months of loop PRs the journals track beside the other PRs, naming journals as the source", () => {
    journalTracking("2026-05-20T09:00:00Z", 10);
    const gitLogSince: string[] = [];

    const report = postMergeQualityReport(
      new ShipHistory(root, "read"),
      new Date("2026-11-15T12:00:00Z"),
      {
        mainHistorySince: (since) => {
          gitLogSince.push(since);
          return OCTOBER_HISTORY;
        },
        loopPullRequestsMergedIn: () => {
          throw new Error(
            "GitHub is not needed while journals cover every month",
          );
        },
      },
    );

    expect(gitLogSince).toEqual(["2026-06-01T00:00:00.000Z"]);
    expect(report).toBe(
      [
        "Post-merge quality by UTC month of merge",
        "Loop ownership: local ship journals (from 2026-05-20).",
        "",
        "| month | loop merged | reverted | follow-up fix | other merged | reverted | follow-up fix |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        "| 2026-06 | 0 | 0 | 0 | 0 | 0 | 0 |",
        "| 2026-07 | 0 | 0 | 0 | 0 | 0 | 0 |",
        "| 2026-08 | 0 | 0 | 0 | 0 | 0 | 0 |",
        "| 2026-09 | 0 | 0 | 0 | 0 | 0 | 0 |",
        "| 2026-10 | 1 | 1 (100.0%) | 0 (0.0%) | 3 | 0 (0.0%) | 1 (33.3%) |",
        "| 2026-11 | 0 | 0 | 0 | 0 | 0 | 0 |",
        "| 6 months | 1 | 1 (100.0%) | 0 (0.0%) | 3 | 0 (0.0%) | 1 (33.3%) |",
        "",
        'Reverted: a later Revert "…" commit names the PR, and no revert of that revert followed. Follow-up fix: a fix commit merged within 7 days after the PR touches at least one of its files. Merges in the last 7 days may still gain one.',
      ].join("\n"),
    );
  });

  test("without a journal that tracks a PR, GitHub names the loop's PRs for every month", () => {
    const askedGitHubFor: (readonly string[])[] = [];

    const report = postMergeQualityReport(
      new ShipHistory(root, "read"),
      new Date("2026-11-15T12:00:00Z"),
      {
        mainHistorySince: () => OCTOBER_HISTORY,
        loopPullRequestsMergedIn: (months) => {
          askedGitHubFor.push(months);
          return new Set([10, 11]);
        },
      },
    );

    expect(askedGitHubFor).toEqual([
      ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"],
    ]);
    expect(report).toContain(
      "Loop ownership: GitHub, the merged PRs the gh account opened from a loop branch (no local ship journal tracks a PR).",
    );
    expect(report).toContain(
      "| 2026-10 | 2 | 1 (50.0%) | 1 (50.0%) | 2 | 0 (0.0%) | 0 (0.0%) |",
    );
  });

  test("journals that start inside the window leave the months up to their first to GitHub", () => {
    journalTracking("2026-10-03T09:00:00Z", 11);
    const askedGitHubFor: (readonly string[])[] = [];

    const report = postMergeQualityReport(
      new ShipHistory(root, "read"),
      new Date("2026-11-15T12:00:00Z"),
      {
        mainHistorySince: () => OCTOBER_HISTORY,
        loopPullRequestsMergedIn: (months) => {
          askedGitHubFor.push(months);
          return new Set([10]);
        },
      },
    );

    expect(askedGitHubFor).toEqual([
      ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
    ]);
    expect(report).toContain(
      "Loop ownership: local ship journals (from 2026-10-03), and GitHub for 2026-06 to 2026-10, the merged PRs the gh account opened from a loop branch.",
    );
    expect(report).toContain(
      "| 2026-10 | 2 | 1 (50.0%) | 1 (50.0%) | 2 | 0 (0.0%) | 0 (0.0%) |",
    );
  });
});
