import { describe, expect, test } from "vitest";

import type { MergeOutcome } from "./verdict.js";
import {
  asCiEvidenceBrief,
  failedOnlyOnTheScreenshotDiff,
  gatesARepairRuns,
  idsInJobUrl,
  SCREENSHOT_DIFF_STEP,
} from "./repair.js";

describe("idsInJobUrl", () => {
  test("reads the run and the job out of an actions job url", () => {
    expect(
      idsInJobUrl(
        "https://github.com/withplumix/plumix/actions/runs/36347408168/job/108699228007",
      ),
    ).toEqual({ runId: "36347408168", jobId: "108699228007" });
  });

  test("a url that is not an actions job has no ids", () => {
    expect(idsInJobUrl("https://dash.cloudflare.com/builds/1")).toBeUndefined();
    expect(idsInJobUrl(undefined)).toBeUndefined();
  });
});

describe("failedOnlyOnTheScreenshotDiff", () => {
  test("a job whose one failed step is the screenshot diff needs only the recaptured images", () => {
    expect(failedOnlyOnTheScreenshotDiff([SCREENSHOT_DIFF_STEP])).toBe(true);
  });

  test("a job that also failed a test is not fixed by images alone", () => {
    expect(
      failedOnlyOnTheScreenshotDiff([
        "Run pnpm test:e2e",
        SCREENSHOT_DIFF_STEP,
      ]),
    ).toBe(false);
  });

  test("a job with no failed step is not a screenshot failure", () => {
    expect(failedOnlyOnTheScreenshotDiff([])).toBe(false);
  });
});

describe("asCiEvidenceBrief", () => {
  const ticket = { number: 2607, title: "t" };
  const pullRequest = { number: 2647, url: "https://github.com/o/r/pull/2647" };

  test("carries each failing job's log, so the fixer reads what CI saw", () => {
    const brief = asCiEvidenceBrief(ticket, pullRequest, {
      logs: [
        { name: "Knip", log: "Unused exported types (1)\nPublicAuthor  type" },
      ],
      codeScanningAlerts: [],
      reviewThreads: [],
    });

    expect(brief).toContain("#2647");
    expect(brief).toContain("#2607");
    expect(brief).toContain("Knip");
    expect(brief).toContain("PublicAuthor  type");
  });

  test("carries code scanning alerts and says a false positive is a person's call", () => {
    const brief = asCiEvidenceBrief(ticket, pullRequest, {
      logs: [],
      codeScanningAlerts: ["Improper code sanitization at a.ts:18"],
      reviewThreads: [],
    });

    expect(brief).toContain("Improper code sanitization at a.ts:18");
    expect(brief).toMatch(/false positive/i);
  });

  test("has nothing to say when CI left no evidence", () => {
    expect(
      asCiEvidenceBrief(ticket, pullRequest, {
        logs: [],
        codeScanningAlerts: [],
        reviewThreads: [],
      }),
    ).toBeNull();
  });

  test("carries a bot's review threads with where they point", () => {
    const brief = asCiEvidenceBrief(ticket, pullRequest, {
      logs: [],
      codeScanningAlerts: [],
      reviewThreads: [
        {
          id: "t1",
          author: "coderabbitai",
          byABot: true,
          location: "packages/core/src/a.ts:12",
          body: "this drops the locale",
          url: "https://github.com/o/r/pull/2647#discussion_r1",
        },
      ],
    });

    expect(brief).toContain("coderabbitai");
    expect(brief).toContain("packages/core/src/a.ts:12");
    expect(brief).toContain("this drops the locale");
  });
});

describe("gatesARepairRuns", () => {
  const refused = (
    over: Partial<Extract<MergeOutcome, { status: "failed" }>>,
  ): Extract<MergeOutcome, { status: "failed" }> => ({
    status: "failed",
    reason: "refused",
    failingChecks: [],
    ...over,
  });
  const namesOf = (refusal: Extract<MergeOutcome, { status: "failed" }>) =>
    gatesARepairRuns(refusal).map(({ name }) => name);

  test("a branch refused only for conflicting is pushed once rebased, for CI to judge", () => {
    expect(namesOf(refused({ conflicted: true }))).toEqual([]);
  });

  test("a check CI alone runs is run locally once CI has failed it, so the fix is proven before the push", () => {
    const names = namesOf(
      refused({ failingChecks: [{ name: "Lint" }, { name: "Typecheck" }] }),
    );

    expect(names).toEqual(
      expect.arrayContaining(["lint", "typecheck", "test"]),
    );
    expect(names).not.toContain("attw");
  });

  test("a failing test is repaired against the local gates without the checks CI already passed", () => {
    const names = namesOf(refused({ failingChecks: [{ name: "Test" }] }));

    expect(names).toEqual(
      expect.arrayContaining(["install", "test", "changeset"]),
    );
    expect(names).not.toContain("lint");
  });
});
