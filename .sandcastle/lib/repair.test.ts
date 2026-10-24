import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { MergeOutcome } from "./verdict.js";
import { whyTheRebaseIsUnfinished } from "./freshen.js";
import {
  afterCiFix,
  aRerunCannotTurnItGreen,
  aRerunCouldTurnThemGreen,
  asCiEvidenceBrief,
  failedOnlyOnTheScreenshotDiff,
  failureTailOf,
  gatesARepairRuns,
  idsInJobUrl,
  recaptureScreenshots,
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
    expect(
      namesOf(refused({ failingChecks: [{ name: "Are The Types Wrong" }] })),
    ).toContain("attw");
  });

  test("a Publint repair skips the slow gates CI already passed, and leaves them to CI", () => {
    const names = namesOf(refused({ failingChecks: [{ name: "Publint" }] }));

    expect(names).toEqual(
      expect.arrayContaining(["install", "publint", "format", "typecheck"]),
    );
    expect(names).not.toContain("lint");
    expect(names).not.toContain("test");
    expect(names).not.toContain("e2e");
    expect(names).not.toContain("attw");
  });

  test("a slow gate CI failed is run locally, so the fix is proven before the push", () => {
    const names = namesOf(
      refused({ failingChecks: [{ name: "Lint" }, { name: "Test" }] }),
    );

    expect(names).toEqual(expect.arrayContaining(["install", "lint", "test"]));
    expect(names).not.toContain("e2e");
  });
});

describe("aRerunCannotTurnItGreen", () => {
  test("a job that failed the screenshot diff fails it again on a re-run, so the free re-run is skipped", () => {
    expect(
      aRerunCannotTurnItGreen([["Run pnpm test:e2e"], [SCREENSHOT_DIFF_STEP]]),
    ).toBe(true);
  });

  test("a job that failed only a test may pass on a re-run", () => {
    expect(aRerunCannotTurnItGreen([["Run pnpm test:e2e"]])).toBe(false);
  });
});

describe("aRerunCouldTurnThemGreen", () => {
  test.each(["Publint", "Lint", "Typecheck", "Format", "Knip", "i18n"])(
    "a %s failure fails the same on a re-run, so the refusal goes straight to a repair",
    (name) => {
      expect(aRerunCouldTurnThemGreen([{ name, conclusion: "FAILURE" }])).toBe(
        false,
      );
    },
  );

  test.each(["Test", "Test (e2e)", "Smoke (scaffold)"])(
    "a %s failure can be a flake, so it is re-run once",
    (name) => {
      expect(aRerunCouldTurnThemGreen([{ name, conclusion: "FAILURE" }])).toBe(
        true,
      );
    },
  );

  test.each(["CANCELLED", "TIMED_OUT"])(
    "any check that ended %s never finished judging the branch, so it is re-run",
    (conclusion) => {
      expect(aRerunCouldTurnThemGreen([{ name: "Lint", conclusion }])).toBe(
        true,
      );
    },
  );

  test("a flaky failure beside a deterministic one still needs the repair", () => {
    expect(
      aRerunCouldTurnThemGreen([
        { name: "Test", conclusion: "FAILURE" },
        { name: "Publint", conclusion: "FAILURE" },
      ]),
    ).toBe(false);
  });
});

describe("failureTailOf", () => {
  const log = [
    "2026-10-23T20:22:08Z ##[group]Run pnpm surface:check",
    "2026-10-23T20:22:14Z plumix (no subpath) PlumixFetch: every other type has exactly one role subpath",
    "2026-10-23T20:22:14Z ##[error]Process completed with exit code 1.",
    "2026-10-23T20:22:15Z Post job cleanup.",
    "2026-10-23T20:22:15Z [command]/usr/bin/git version",
  ].join("\n");

  test("ends at the job's last error, not in the post-job cleanup after it", () => {
    const tail = failureTailOf(log, 1_000);

    expect(tail).toContain("PlumixFetch: every other type");
    expect(tail).not.toContain("Post job cleanup");
  });

  test("keeps only the characters closest to the error", () => {
    expect(failureTailOf(log, 40)).toBe(
      "##[error]Process completed with exit code 1.".slice(-40),
    );
  });

  test("a log with no error line is tailed whole", () => {
    expect(failureTailOf("one\ntwo", 3)).toBe("two");
  });
});

describe("recaptureScreenshots", () => {
  // `gh run download` refuses to extract over a file that exists, which is
  // every committed image.
  const ghRunDownload = (images: Record<string, string>) => (into: string) => {
    mkdirSync(into, { recursive: true });
    if (readdirSync(into).length > 0)
      throw new Error("error extracting zip archive: file exists");
    for (const [name, bytes] of Object.entries(images))
      writeFileSync(join(into, name), bytes);
  };

  test("the recaptured images replace the committed ones they share a name with", () => {
    const worktree = mkdtempSync(join(tmpdir(), "recapture-"));
    const shots = join(worktree, "apps/docs/src/assets/screenshots");
    mkdirSync(shots, { recursive: true });
    writeFileSync(join(shots, "admin-dashboard-light.png"), "old");

    const recaptured = recaptureScreenshots(
      ghRunDownload({ "admin-dashboard-light.png": "new" }),
      worktree,
    );

    expect(recaptured).toBe(true);
    expect(readFileSync(join(shots, "admin-dashboard-light.png"), "utf8")).toBe(
      "new",
    );
  });

  test("a download that fails recaptures nothing", () => {
    const worktree = mkdtempSync(join(tmpdir(), "recapture-"));

    expect(
      recaptureScreenshots(() => {
        throw new Error("no artifact docs-screenshots");
      }, worktree),
    ).toBe(false);
  });
});

describe("afterCiFix", () => {
  const declinedBecause = (reason: string) => ({
    reason,
    notThisBranch: false,
  });

  test("a fix that changed the branch goes on to the gates", () => {
    expect(afterCiFix(null, { rebaseMovedTheBranch: false })).toEqual({
      next: "gates",
    });
  });

  test("nothing left to fix after a rebase onto newer main still gates and pushes the rebased branch", () => {
    // #3145: the rebase brought in main's fix, the fixer rightly committed
    // nothing, and the stale head stayed on the PR.
    expect(
      afterCiFix(declinedBecause("the rebase already fixes it"), {
        rebaseMovedTheBranch: true,
      }),
    ).toEqual({ next: "gates" });
  });

  test("a fixer that changes nothing on an unmoved branch declines", () => {
    expect(
      afterCiFix(declinedBecause("can't reproduce"), {
        rebaseMovedTheBranch: false,
      }),
    ).toEqual({ next: "decline", reason: "can't reproduce" });
  });

  test("a failure the fixer pins on something else is not this branch's", () => {
    expect(
      afterCiFix(
        { reason: "flaky runner", notThisBranch: true },
        { rebaseMovedTheBranch: true },
      ),
    ).toEqual({ next: "not-this-branch", reason: "flaky runner" });
  });
});

describe("whyTheRebaseIsUnfinished", () => {
  const sandbox = (fails: (command: string) => boolean) => ({
    exec: async (command: string) => ({
      exitCode: fails(command) ? 1 : 0,
      stdout: "",
      stderr: "",
      durationMs: 0,
    }),
  });

  test("a finished rebase on top of main has nothing to report", async () => {
    expect(await whyTheRebaseIsUnfinished(sandbox(() => false))).toBeNull();
  });

  test("names a rebase still in progress", async () => {
    expect(
      await whyTheRebaseIsUnfinished(
        sandbox((command) => command.includes("rebase-merge")),
      ),
    ).toBe("a rebase is still in progress in the sandbox");
  });

  test("names a branch that does not sit on main", async () => {
    expect(
      await whyTheRebaseIsUnfinished(
        sandbox((command) => command.includes("is-ancestor")),
      ),
    ).toBe("HEAD does not contain origin/main");
  });
});
