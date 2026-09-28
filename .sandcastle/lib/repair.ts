import { execFileSync } from "node:child_process";
import { join } from "node:path";

import type { QueuedPullRequest, Ticket } from "./github.js";
import type { RepairOutcome } from "./run.js";
import type { Journal } from "./telemetry.js";
import type { MergeOutcome, ReviewThread } from "./verdict.js";
import { agentPhaseRunner, PROMPT_DIR } from "./agent.js";
import { CHANGESET_GATE, GATES } from "./gates.js";
import {
  branchOfPullRequest,
  clearLeftoverWorktree,
  pushBranch,
  resolveReviewThreads,
} from "./github.js";
import { say } from "./log.js";
import { REPO_ROOT, REPO_SLUG } from "./repo.js";
import {
  AN_HOUR_IN_SECONDS,
  closePlumixSandbox,
  createPlumixSandbox,
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

const gh = (args: readonly string[], cwd = REPO_ROOT): string =>
  execFileSync("gh", [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

const git = (args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd: REPO_ROOT, encoding: "utf8" });

const failedStepsOf = (jobId: string): readonly string[] =>
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

const recapturedScreenshotsInto = (
  runId: string,
  worktreePath: string,
): boolean => {
  try {
    gh([
      "run",
      "download",
      runId,
      "-R",
      REPO_SLUG,
      "-n",
      SCREENSHOT_ARTIFACT,
      "-D",
      join(worktreePath, SCREENSHOT_DIR),
    ]);
    return true;
  } catch {
    return false;
  }
};

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

  const sandbox = await createPlumixSandbox(branch);
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
      const fixDeclined = await fixer.apply("repair:ci", brief);
      if (fixDeclined) return declined(`${refusal.reason}\n\n${fixDeclined}`);
    }

    const install = {
      name: "install",
      command: "pnpm install --frozen-lockfile && pnpm build",
    };
    const gates = await gatesUntilGreen(
      sandbox,
      [install, ...GATES, CHANGESET_GATE],
      journal,
      fixer,
      "repair",
    );
    if (gates.blocked) return declined(gates.blocked);

    pushBranch(branch, sandbox.worktreePath);
    resolveReviewThreads((refusal.reviewThreads ?? []).map(({ id }) => id));
    return { status: "repaired" };
  } finally {
    const { preservedWorktreePath } = await closePlumixSandbox(sandbox);
    if (preservedWorktreePath)
      say(`Worktree preserved at ${preservedWorktreePath}`);
  }
};
