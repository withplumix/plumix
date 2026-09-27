import { describe, expect, test } from "vitest";

import {
  asCiEvidenceBrief,
  failedOnlyOnTheScreenshotDiff,
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
    });

    expect(brief).toContain("Improper code sanitization at a.ts:18");
    expect(brief).toMatch(/false positive/i);
  });

  test("has nothing to say when CI left no evidence", () => {
    expect(
      asCiEvidenceBrief(ticket, pullRequest, {
        logs: [],
        codeScanningAlerts: [],
      }),
    ).toBeNull();
  });
});
