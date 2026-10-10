import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Gate } from "./gates.js";
import type { QueuedPullRequest, Ticket } from "./github.js";
import type { RepairOutcome } from "./run.js";
import type { Journal } from "./telemetry.js";
import type { MergeOutcome, ReviewThread } from "./verdict.js";
import { agentPhaseRunner, PROMPT_DIR } from "./agent.js";
import { rebaseOntoLatestMain } from "./freshen.js";
import {
  CHANGESET_GATE,
  gateBehindCheck,
  GATES,
  GATES_LEFT_TO_CI,
} from "./gates.js";
import {
  branchOfPullRequest,
  clearLeftoverWorktree,
  pushBranch,
  resolveReviewThreads,
  runStatus,
  syncRepoToMain,
} from "./github.js";
import { say } from "./log.js";
import { REPO_ROOT, REPO_SLUG } from "./repo.js";
import { untilTheRunCompletes } from "./run-completion.js";
import {
  AN_HOUR_IN_SECONDS,
  closePlumixSandbox,
  createPlumixSandbox,
  createUnbuiltSandbox,
} from "./sandbox.js";
import {
  fixerFor,
  gatesUntilGreen,
  IMPLEMENTER,
  readDeclinedTag,
} from "./ticket.js";

export const SCREENSHOT_DIFF_STEP =
  "Assert the committed images are the ones the capture produces";
const SCREENSHOT_ARTIFACT = "docs-screenshots";
const SCREENSHOT_DIR = "apps/docs/src/assets/screenshots";

const LOG_TAIL_CHARACTERS = 6_000;

export const idsInJobUrl = (
  url: string | undefined,
): { runId: string; jobId: string } | undefined => {
  const match = url?.match(/\/actions\/runs\/(\d+)\/job\/(\d+)/);
  return match?.[1] && match[2]
    ? { runId: match[1], jobId: match[2] }
    : undefined;
};

export const failedOnlyOnTheScreenshotDiff = (
  failedSteps: readonly string[],
): boolean =>
  failedSteps.length > 0 &&
  failedSteps.every((step) => step === SCREENSHOT_DIFF_STEP);

interface CiEvidence {
  readonly logs: readonly { name: string; log: string }[];
  readonly codeScanningAlerts: readonly string[];
  readonly reviewThreads: readonly ReviewThread[];
}

export const asCiEvidenceBrief = (
  ticket: Ticket,
  pullRequest: QueuedPullRequest,
  { logs, codeScanningAlerts, reviewThreads }: CiEvidence,
): string | null => {
  if (
    logs.length === 0 &&
    codeScanningAlerts.length === 0 &&
    reviewThreads.length === 0
  )
    return null;

  const sections = [
    `This branch is ${pullRequest.url} (#${pullRequest.number}), implementing #${ticket.number}. ` +
      `It passed the local gates but GitHub refused it. Read the ticket (\`gh issue view ${ticket.number}\`) ` +
      "and the diff against origin/main for context, find the root cause of each failure below, and fix it.",
  ];
  for (const { name, log } of logs) {
    sections.push(
      `CI job **${name}** failed. The tail of its log:\n\n\`\`\`\n${log}\n\`\`\``,
    );
  }
  if (codeScanningAlerts.length > 0) {
    sections.push(
      `Code scanning blocks the merge:\n\n${codeScanningAlerts.map((alert) => `- ${alert}`).join("\n")}\n\n` +
        "Fix the code if the alert is right. If it is a false positive, do not work around it — " +
        "dismissing an alert is a person's call, so decline and say why.",
    );
  }
  for (const { author, location, body, url } of reviewThreads) {
    sections.push(
      `**${author}** left an unresolved review thread on \`${location}\` (${url}):\n\n> ${body.split("\n").join("\n> ")}\n\n` +
        "Address it in the code. If the reviewer is wrong, decline and say why.",
    );
  }
  return sections.join("\n\n");
};

const INSTALL_GATE: Gate = {
  name: "install",
  command: "pnpm install --frozen-lockfile && pnpm build",
};

export const gatesARepairRuns = (
  refusal: Extract<MergeOutcome, { status: "failed" }>,
): readonly Gate[] => {
  if (refusal.conflicted) return [];
  const failedInCi = new Set(
    refusal.failingChecks.map(({ name }) => gateBehindCheck(name)),
  );
  return [
    INSTALL_GATE,
    ...GATES_LEFT_TO_CI.filter((gate) => failedInCi.has(gate)),
    ...GATES,
    CHANGESET_GATE,
  ];
};

const gh = (args: readonly string[], cwd = REPO_ROOT): string =>
  execFileSync("gh", [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

const git = (args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd: REPO_ROOT, encoding: "utf8" });

export const failedStepsOf = (jobId: string): readonly string[] =>
  JSON.parse(
    gh([
      "api",
      `repos/${REPO_SLUG}/actions/jobs/${jobId}`,
      "--jq",
      '[.steps[] | select(.conclusion == "failure") | .name]',
    ]),
  ) as readonly string[];

const failedLogTail = (jobId: string): string => {
  try {
    return gh([
      "run",
      "view",
      "-R",
      REPO_SLUG,
      "--job",
      jobId,
      "--log-failed",
    ]).slice(-LOG_TAIL_CHARACTERS);
  } catch (error) {
    return `(the log could not be fetched: ${String(error)})`;
  }
};

export const aRerunCannotTurnItGreen = (
  failedStepsOfEachJob: readonly (readonly string[])[],
): boolean =>
  failedStepsOfEachJob.some((steps) => steps.includes(SCREENSHOT_DIFF_STEP));

/**
 * `gh run download` will not extract over an existing file, and every image is
 * one the branch committed, so it downloads somewhere empty and copies over.
 */
export const recaptureScreenshots = (
  downloadInto: (directory: string) => void,
  worktreePath: string,
): boolean => {
  const downloaded = mkdtempSync(join(tmpdir(), "recaptured-screenshots-"));
  try {
    downloadInto(downloaded);
    cpSync(downloaded, join(worktreePath, SCREENSHOT_DIR), { recursive: true });
    return true;
  } catch {
    return false;
  } finally {
    rmSync(downloaded, { recursive: true, force: true });
  }
};

const recapturedScreenshotsInto = (
  runId: string,
  worktreePath: string,
): boolean =>
  recaptureScreenshots(
    (directory) =>
      gh([
        "run",
        "download",
        runId,
        "-R",
        REPO_SLUG,
        "-n",
        SCREENSHOT_ARTIFACT,
        "-D",
        directory,
      ]),
    worktreePath,
  );

export const repairPullRequest = async (
  ticket: Ticket,
  pullRequest: QueuedPullRequest,
  refusal: MergeOutcome,
  journal: Journal,
): Promise<RepairOutcome> => {
  if (refusal.status === "merged") return { status: "repaired" };

  const branch = branchOfPullRequest(pullRequest.number);
  journal.setTicket(ticket, branch);
  git(["fetch", "-q", "origin", "main", branch]);
  clearLeftoverWorktree(branch);
  git(["branch", "-f", branch, `origin/${branch}`]);

  const runsStillGoing = [
    ...new Set(
      refusal.failingChecks.flatMap(({ url }) => idsInJobUrl(url)?.runId ?? []),
    ),
  ];
  for (const runId of runsStillGoing) {
    const completed = await untilTheRunCompletes(
      () => runStatus(runId),
      () => new Promise((resolve) => setTimeout(resolve, 30_000)),
      { attempts: 60 },
    );
    if (!completed)
      say(`  CI run ${runId} is still going; reading what it has`);
  }

  const sandbox = await (
    refusal.conflicted ? createUnbuiltSandbox : createPlumixSandbox
  )(branch);
  const runAgentPhase = agentPhaseRunner(sandbox, journal);
  const declined = (reason: string): RepairOutcome => ({
    status: "declined",
    reason,
  });

  try {
    say(`\n--- repair #${pullRequest.number}: rebase onto main ---`);
    const rebase = await sandbox.exec("git rebase origin/main");
    if (rebase.exitCode !== 0) {
      const resolved = await runAgentPhase("resolve-conflicts", IMPLEMENTER, {
        promptFile: join(PROMPT_DIR, "resolve.md"),
        promptArgs: {
          TICKET: String(ticket.number),
          PULL_REQUEST: String(pullRequest.number),
        },
        maxIterations: 10,
        idleTimeoutSeconds: AN_HOUR_IN_SECONDS,
      });
      const finished = await sandbox.exec(
        'test ! -d "$(git rev-parse --git-path rebase-merge)" && test ! -d "$(git rev-parse --git-path rebase-apply)" && git merge-base --is-ancestor origin/main HEAD',
      );
      if (finished.exitCode !== 0) {
        return declined(
          readDeclinedTag(resolved.stdout) ??
            `${pullRequest.url} conflicts with main and the resolver could not finish the rebase`,
        );
      }
    }

    const logs: { name: string; log: string }[] = [];
    for (const { name, url } of refusal.failingChecks) {
      const ids = idsInJobUrl(url);
      if (!ids) {
        logs.push({
          name,
          log: `(no log: ${url ?? "the check carries no link"})`,
        });
        continue;
      }
      if (
        failedOnlyOnTheScreenshotDiff(failedStepsOf(ids.jobId)) &&
        recapturedScreenshotsInto(ids.runId, sandbox.worktreePath)
      ) {
        const committed = await sandbox.exec(
          `git add ${SCREENSHOT_DIR} && git commit -m "docs: recapture the screenshots the change moved" -m "Refs #${ticket.number}"`,
        );
        if (committed.exitCode === 0) {
          say(`  committed the screenshots CI recaptured for ${name}`);
          continue;
        }
      }
      logs.push({ name, log: failedLogTail(ids.jobId) });
    }

    const fixer = fixerFor(runAgentPhase, undefined);
    const brief = asCiEvidenceBrief(ticket, pullRequest, {
      logs,
      codeScanningAlerts: refusal.codeScanningAlerts ?? [],
      reviewThreads: refusal.reviewThreads ?? [],
    });
    if (brief) {
      say(`--- repair #${pullRequest.number}: fix what CI saw ---`);
      const { declined: fixDeclined } = await fixer.apply("repair:ci", brief);
      if (fixDeclined?.notThisBranch) {
        return {
          status: "not-this-branch",
          reason: `${refusal.reason}\n\n${fixDeclined.reason}`,
        };
      }
      if (fixDeclined)
        return declined(`${refusal.reason}\n\n${fixDeclined.reason}`);
    }

    const toRun = gatesARepairRuns(refusal);
    if (toRun.length > 0) {
      const gates = await gatesUntilGreen(
        sandbox,
        toRun,
        journal,
        fixer,
        "repair",
      );
      if (gates.blocked) return declined(gates.blocked);
    }

    const onMain = await rebaseOntoLatestMain(sandbox, syncRepoToMain);
    if (onMain === "kept") {
      say(
        "  the latest main conflicts, so the branch is pushed as it was gated",
      );
    }
    await pushBranch(branch, sandbox.worktreePath);
    resolveReviewThreads((refusal.reviewThreads ?? []).map(({ id }) => id));
    return { status: "repaired" };
  } finally {
    const { preservedWorktreePath } = await closePlumixSandbox(sandbox);
    if (preservedWorktreePath)
      say(`Worktree preserved at ${preservedWorktreePath}`);
  }
};
