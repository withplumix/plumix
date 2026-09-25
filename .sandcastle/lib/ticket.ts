import { join } from "node:path";
import { z } from "zod";

import type { RunAgentPhase } from "./agent.js";
import type { GateFailure } from "./gates.js";
import type { Ticket } from "./github.js";
import type { Journal } from "./telemetry.js";
import {
  agentPhaseRunner,
  parsedJsonOrNull,
  PROMPT_DIR,
  startClock,
  taggedBlock,
} from "./agent.js";
import {
  CHANGESET_GATE,
  gateBehindCheck,
  GATES,
  reproduceFailingChecks,
  runGates,
} from "./gates.js";
import {
  assignToSelf,
  isTicketClosed,
  openPullRequest,
  pushBranch,
  queueForMerge,
  rePushBranch,
  resetBranchToMain,
  syncRepoToMain,
  waitForMerge,
} from "./github.js";
import { say } from "./log.js";
import { MERGE_BASE } from "./repo.js";
import {
  AN_HOUR_IN_SECONDS,
  createPlumixSandbox,
  HALF_AN_HOUR_IN_SECONDS,
} from "./sandbox.js";

const IMPLEMENTER_MODEL = "claude-opus-5-5";
const REVIEWER_MODEL = "claude-sonnet-5";

const MAX_GATE_FIX_ROUNDS = 4;
const MAX_REVIEW_FIX_ROUNDS = 3;
const MAX_LAND_FIX_ROUNDS = 2;
const BLOCKING_SEVERITY = "high";
const ITERATIONS_ALLOWED_WHEN_RESUMING_A_SESSION = 1;
const MERGE_POLL_INTERVAL_MS = 120_000;
const MERGE_GIVE_UP_AFTER_MS = 2_700_000;

const REVIEWERS = [
  { name: "correctness", promptFile: "review-correctness.md" },
  { name: "simplify", promptFile: "review-simplify.md" },
  { name: "spec", promptFile: "review-spec.md" },
] as const;

const findingSchema = z.object({
  findings: z.array(
    z
      .object({
        file: z.string(),
        line: z.number().optional(),
        severity: z.enum(["high", "medium", "low"]).catch("medium"),
        summary: z.string(),
        why: z.string().optional(),
        failure_scenario: z.string().optional(),
      })
      .transform(({ failure_scenario, why, ...rest }) => ({
        ...rest,
        why: why ?? failure_scenario ?? "",
      })),
  ),
});

type Finding = z.infer<typeof findingSchema>["findings"][number];

export interface Review {
  readonly findings: readonly Finding[];
  readonly emittedParseableFindings: boolean;
}

const NO_PARSEABLE_REVIEW: Review = {
  findings: [],
  emittedParseableFindings: false,
};

export type ShipOutcome =
  | { readonly status: "shipped"; readonly pullRequestUrl: string }
  | {
      readonly status: "blocked";
      readonly reason: string;
      readonly pullRequestUrl?: string;
    };

export const readFindingsTag = (stdout: string): Review => {
  const block = taggedBlock(stdout, "findings");
  if (!block) return NO_PARSEABLE_REVIEW;

  const parsed = findingSchema.safeParse(parsedJsonOrNull(block));
  if (!parsed.success) return NO_PARSEABLE_REVIEW;

  return { findings: parsed.data.findings, emittedParseableFindings: true };
};

export interface PullRequestCopy {
  readonly title: string;
  readonly body: string;
}

export const readPullRequestTag = (
  stdout: string,
  ticket: Ticket,
): PullRequestCopy => {
  const block = taggedBlock(stdout, "pr");
  const title = block?.match(/^title:\s*(.+)$/m)?.[1]?.trim();
  const body = block
    ?.split(/^body:\s*$/m)
    .at(1)
    ?.trim();

  return {
    title: title ?? `fix: ${ticket.title}`,
    body:
      body ??
      `**Fixes #${ticket.number}**\n\nThe implementer emitted no \`<pr>\` block, so this body is a fallback.`,
  };
};

const asFindingTally = ({ findings, emittedParseableFindings }: Review) => ({
  total: findings.length,
  high: findings.filter(({ severity }) => severity === "high").length,
  medium: findings.filter(({ severity }) => severity === "medium").length,
  low: findings.filter(({ severity }) => severity === "low").length,
  parsed: emittedParseableFindings,
});

const asFixBrief = (findings: readonly Finding[]): string =>
  findings
    .map(
      ({ severity, file, line, summary, why }, index) =>
        `${index + 1}. [${severity}] ${file}${line ? `:${line}` : ""} — ${summary}\n   ${why}`,
    )
    .join("\n\n");

const asGateFailureBrief = ({ command, output }: GateFailure): string =>
  `The harness ran \`${command}\` and it failed. Fix it.\n\n\`\`\`\n${output}\n\`\`\``;

const reviewAll = async (
  runAgentPhase: RunAgentPhase,
  journal: Journal,
  ticket: Ticket,
  round: number,
): Promise<readonly Finding[]> => {
  const collected: Finding[] = [];

  for (const reviewer of REVIEWERS) {
    const phase = `review:${reviewer.name}#${round}`;
    const { stdout } = await runAgentPhase(phase, REVIEWER_MODEL, {
      promptFile: join(PROMPT_DIR, reviewer.promptFile),
      promptArgs: { TICKET: String(ticket.number), BASE: MERGE_BASE },
      maxIterations: 1,
      idleTimeoutSeconds: HALF_AN_HOUR_IN_SECONDS,
    });

    const review = readFindingsTag(stdout);
    journal.record({
      phase: `${phase}:findings`,
      kind: "review",
      model: REVIEWER_MODEL,
      startedAt: new Date().toISOString(),
      durationMs: 0,
      outcome: review.emittedParseableFindings ? "ok" : "fail",
      detail: review.emittedParseableFindings
        ? undefined
        : "no parseable <findings> block",
      findings: asFindingTally(review),
    });
    collected.push(...review.findings);
  }

  return collected;
};

export const shipTicket = async (
  ticket: Ticket,
  journal: Journal,
): Promise<ShipOutcome> => {
  const branch = `feat/${ticket.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}-${ticket.number}`;
  journal.setTicket(ticket, branch);
  say(
    `\n=== #${ticket.number} ${ticket.title}\n=== branch ${branch}\n=== run ${journal.runId}\n`,
  );

  assignToSelf(ticket.number);
  resetBranchToMain(branch);
  const sandbox = await createPlumixSandbox(branch);
  const runAgentPhase = agentPhaseRunner(sandbox, journal);

  try {
    say("\n--- baseline gates on main ---");
    const baseline = await runGates(sandbox, GATES, {
      stopAtFirstFailure: false,
      onResult: (result) =>
        journal.record({
          phase: `baseline:${result.name}`,
          kind: "gate",
          startedAt: result.startedAt,
          durationMs: result.durationMs,
          outcome: result.outcome,
          detail: result.skippedBecause,
          command: result.command,
          exitCode: result.exitCode,
        }),
    });
    const gatesAlreadyRedOnMain = baseline.failures.map(({ name }) => name);
    if (gatesAlreadyRedOnMain.length > 0) {
      say(
        `  already red on main, will not be this ticket's problem: ${gatesAlreadyRedOnMain.join(", ")}`,
      );
    }
    const gatesThisTicketOwns = [...GATES, CHANGESET_GATE].filter(
      ({ name }) => !gatesAlreadyRedOnMain.includes(name),
    );

    say("\n--- implement ---");
    const implemented = await runAgentPhase("implement", IMPLEMENTER_MODEL, {
      promptFile: join(PROMPT_DIR, "implement.md"),
      promptArgs: { TICKET: String(ticket.number) },
      maxIterations: 40,
      idleTimeoutSeconds: AN_HOUR_IN_SECONDS,
    });
    if (!implemented.commits.length)
      return {
        status: "blocked",
        reason: "the implementer produced no commits",
      };

    const pullRequestCopy = readPullRequestTag(implemented.stdout, ticket);
    let sessionToResume = implemented.iterations.at(-1)?.sessionId;
    let gateFixes = 0;
    let reviewFixes = 0;
    let pass = 0;
    let advisory: readonly Finding[] = [];

    const applyFixes = async (brief: string): Promise<void> => {
      const fixed = await runAgentPhase(`fix#${pass}`, IMPLEMENTER_MODEL, {
        promptFile: join(PROMPT_DIR, "fix.md"),
        promptArgs: { FINDINGS: brief },
        maxIterations: ITERATIONS_ALLOWED_WHEN_RESUMING_A_SESSION,
        idleTimeoutSeconds: AN_HOUR_IN_SECONDS,
        resumeSession: sessionToResume,
      });
      sessionToResume = fixed.iterations.at(-1)?.sessionId ?? sessionToResume;
    };

    while (true) {
      pass += 1;
      say(`\n--- gate (pass ${pass}) ---`);
      const { failures } = await runGates(sandbox, gatesThisTicketOwns, {
        stopAtFirstFailure: true,
        onResult: (result) =>
          journal.record({
            phase: `gate:${result.name}#${pass}`,
            kind: "gate",
            startedAt: result.startedAt,
            durationMs: result.durationMs,
            outcome: result.outcome,
            detail: result.skippedBecause,
            command: result.command,
            exitCode: result.exitCode,
          }),
      });

      const [failure] = failures;
      if (failure) {
        gateFixes += 1;
        if (gateFixes > MAX_GATE_FIX_ROUNDS) {
          return {
            status: "blocked",
            reason: `still failing \`${failure.command}\` after ${MAX_GATE_FIX_ROUNDS} fix rounds`,
          };
        }
        say(`--- fix gate failure (${gateFixes}/${MAX_GATE_FIX_ROUNDS}) ---`);
        await applyFixes(asGateFailureBrief(failure));
        continue;
      }

      say(`--- review (pass ${pass}) ---`);
      const findings = await reviewAll(runAgentPhase, journal, ticket, pass);
      const blocking = findings.filter(
        ({ severity }) => severity === BLOCKING_SEVERITY,
      );
      advisory = findings.filter(
        ({ severity }) => severity !== BLOCKING_SEVERITY,
      );
      if (blocking.length === 0) break;

      reviewFixes += 1;
      if (reviewFixes > MAX_REVIEW_FIX_ROUNDS) {
        return {
          status: "blocked",
          reason: `${blocking.length} ${BLOCKING_SEVERITY}-severity finding(s) still open after ${MAX_REVIEW_FIX_ROUNDS} review rounds`,
        };
      }
      say(
        `--- fix ${blocking.length} ${BLOCKING_SEVERITY} finding(s) (${reviewFixes}/${MAX_REVIEW_FIX_ROUNDS}) ---`,
      );
      await applyFixes(asFixBrief(blocking));
    }

    say("\n--- land ---");
    pushBranch(branch, sandbox.worktreePath);
    const advisoryNote =
      advisory.length === 0
        ? ""
        : `\n\n---\n\n### Reviewer notes, not blocking\n\n${advisory
            .map(
              ({ severity, file, line, summary }) =>
                `- **[${severity}]** \`${file}${line ? `:${line}` : ""}\` — ${summary}`,
            )
            .join("\n")}`;
    const pullRequest = openPullRequest(
      branch,
      pullRequestCopy.title,
      pullRequestCopy.body + advisoryNote,
    );

    let landFixes = 0;
    while (true) {
      const landClock = startClock();
      queueForMerge(pullRequest.number);
      say(`  queued ${pullRequest.url}`);

      const merge = await waitForMerge(pullRequest.number, {
        pollEveryMs: MERGE_POLL_INTERVAL_MS,
        giveUpAfterMs: MERGE_GIVE_UP_AFTER_MS,
        onPoll: (status) => say(`  ${status}`),
      });

      journal.record({
        phase: landFixes === 0 ? "land" : `land#${landFixes}`,
        kind: "gate",
        startedAt: landClock.startedAt,
        durationMs: landClock.elapsedMs(),
        outcome: merge.status === "merged" ? "ok" : "fail",
        detail: merge.status === "merged" ? pullRequest.url : merge.reason,
      });

      if (merge.status === "merged") break;

      const checksNoLocalGateMirrors = merge.failingChecks.filter(
        (name) => !gateBehindCheck(name),
      );
      if (checksNoLocalGateMirrors.length > 0) {
        journal.record({
          phase: "ci-gap",
          kind: "gate",
          startedAt: new Date().toISOString(),
          durationMs: 0,
          outcome: "fail",
          detail: `CI checks with no local gate: ${checksNoLocalGateMirrors.join(", ")}`,
        });
        say(`  no local gate mirrors: ${checksNoLocalGateMirrors.join(", ")}`);
      }

      landFixes += 1;
      if (merge.failingChecks.length === 0 || landFixes > MAX_LAND_FIX_ROUNDS) {
        return {
          status: "blocked",
          reason: merge.reason,
          pullRequestUrl: pullRequest.url,
        };
      }

      say(
        `--- fix ${merge.failingChecks.length} failing CI check(s) (${landFixes}/${MAX_LAND_FIX_ROUNDS}) ---`,
      );
      pass += 1;
      await applyFixes(
        await reproduceFailingChecks(sandbox, merge.failingChecks),
      );
      rePushBranch(branch, sandbox.worktreePath);
    }

    syncRepoToMain();
    if (!isTicketClosed(ticket.number)) {
      say(
        `  warning: #${ticket.number} did not close — check the PR body's Fixes reference`,
      );
    }
    return { status: "shipped", pullRequestUrl: pullRequest.url };
  } finally {
    const { preservedWorktreePath } = await sandbox.close();
    if (preservedWorktreePath)
      say(`Worktree preserved at ${preservedWorktreePath}`);
  }
};
