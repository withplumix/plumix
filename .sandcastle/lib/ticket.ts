import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { RunAgentPhase, Thinker } from "./agent.js";
import type { Executor, Gate, GateFailure } from "./gates.js";
import type { QueuedPullRequest, Ticket } from "./github.js";
import type { ShipHistory } from "./ship-history.js";
import type { Journal } from "./telemetry.js";
import {
  agentPhaseRunner,
  parsedJsonOrNull,
  PROMPT_DIR,
  readOrAskAgain,
  startClock,
  taggedBlock,
} from "./agent.js";
import { analyseBeforeSetup } from "./analysis.js";
import { checkBrief } from "./brief-check.js";
import { decideOnTheBranch } from "./decide.js";
import { prepareDelivery } from "./delivery.js";
import { rebaseOntoLatestMain, resolveTheRebase } from "./freshen.js";
import { GATES, GATES_AFTER_A_RESOLVED_REBASE, runGates } from "./gates.js";
import {
  assignToSelf,
  openPullRequest,
  pushBranch,
  queueForMerge,
  resetBranchToMain,
  syncRepoToMain,
} from "./github.js";
import { detail as say } from "./log.js";
import { surveyMutants } from "./mutation.js";
import { MERGE_BASE } from "./repo.js";
import { reviewableHead, reviewHead } from "./review-proof.js";
import {
  AN_HOUR_IN_SECONDS,
  closePlumixSandbox,
  createUnbuiltSandbox,
  SETUP_STEPS,
} from "./sandbox.js";

/**
 * Opus implements, fixes, resolves conflicts and repairs; Sonnet reviews. On
 * 2026-10-25 the reverse cost five times the usage per ticket ($34.5 against
 * $6.9 median): an Opus reviewer sent Sonnet's work round 2.8 review passes
 * instead of 1.3, and the subscription ran dry twice. Opus as the lead still
 * decides parks and unblocks an empty implementation.
 */
export const IMPLEMENTER: Thinker = {
  model: "claude-opus-5-5",
  effort: "medium",
};
const LEAD: Thinker = { model: "claude-opus-5-5", effort: "high" };
const REVIEWER: Thinker = { model: "claude-sonnet-5-5", effort: "high" };

export const afterImplementing = ({
  commits,
  declined,
  unblocked,
}: {
  readonly commits: number;
  readonly declined: string | null;
  readonly unblocked: boolean;
}): "review" | "unblock" | "block" => {
  if (commits > 0) return "review";
  return declined === null && !unblocked ? "unblock" : "block";
};

export const readGuidanceTag = (stdout: string): string | null =>
  taggedBlock(stdout, "guidance") || null;

const LAST_OUTPUT_THE_LEAD_READS = 8_000;
const EMIT_THE_GUIDANCE =
  "End with the <guidance> block the prompt describes: what the implementer should do next.";

const MAX_GATE_FIX_ROUNDS = 4;
export const MAX_REVIEW_FIX_ROUNDS = 2;
const ITERATIONS_ALLOWED_WHEN_RESUMING_A_SESSION = 1;

const findingSchema = z.object({
  findings: z.array(
    z.object({
      file: z.string(),
      line: z.number().optional(),
      severity: z.enum(["high", "medium", "low"]).catch("medium"),
      summary: z.string(),
      why: z.string().default(""),
    }),
  ),
});

type Finding = z.infer<typeof findingSchema>["findings"][number];

interface Findings {
  readonly findings: readonly Finding[];
  readonly emittedParseableFindings: boolean;
}

const NO_PARSEABLE_REVIEW: Findings = {
  findings: [],
  emittedParseableFindings: false,
};

export type ShipOutcome =
  | {
      readonly status: "queued";
      readonly pullRequest: QueuedPullRequest;
    }
  | {
      readonly status: "blocked";
      readonly reason: string;
      readonly pullRequestUrl?: string;
      readonly briefFails?: boolean;
      readonly alreadyDecided?: boolean;
    };

export const readFindingsTag = (stdout: string): Findings => {
  const block = taggedBlock(stdout, "findings");
  if (!block) return NO_PARSEABLE_REVIEW;

  const parsed = findingSchema.safeParse(parsedJsonOrNull(block));
  if (!parsed.success) return NO_PARSEABLE_REVIEW;

  return { findings: parsed.data.findings, emittedParseableFindings: true };
};

export const readDeclinedTag = (stdout: string): string | null =>
  taggedBlock(stdout, "declined") || null;

export interface PullRequestCopy {
  readonly title: string;
  readonly body: string;
}

export const readPullRequestTag = (stdout: string): PullRequestCopy | null => {
  const block = taggedBlock(stdout, "pr");
  const title = block?.match(/^title:\s*(.+)$/m)?.[1]?.trim();
  const body = block
    ?.split(/^body:\s*$/m)
    .at(1)
    ?.trim();
  return title && body ? { title, body } : null;
};

const PR_SKILL_SECTIONS = [
  "## Summary",
  "## Evidence",
  "## Merge Danger",
  "**Door:**",
  "**Blast Radius:**",
];

export const readTemplatedPullRequest = (
  stdout: string,
): PullRequestCopy | null => {
  const copy = readPullRequestTag(stdout);
  return copy &&
    PR_SKILL_SECTIONS.every((section) => copy.body.includes(section))
    ? copy
    : null;
};

const fallbackPullRequestCopy = (ticket: Ticket): PullRequestCopy => ({
  title: `fix: ${ticket.title}`,
  body: `**Fixes #${ticket.number}**\n\nThe implementer emitted no \`<pr>\` block, so this body is a fallback.`,
});

const reviewItemSchema = z.object({
  file: z.string(),
  line: z.number().optional(),
  summary: z.string(),
  why: z.string().default(""),
});

const specGapSchema = reviewItemSchema.extend({
  needsADecision: z.boolean().default(false),
});

const reviewSchema = z.object({
  summary: z.string().default(""),
  specGaps: z.array(specGapSchema).default([]),
  notes: z.array(reviewItemSchema).default([]),
});

export type Review = z.infer<typeof reviewSchema>;
type ReviewItem = Review["notes"][number];

export const readReviewTag = (stdout: string): Review | null => {
  const block = taggedBlock(stdout, "review");
  if (!block) return null;
  const parsed = reviewSchema.safeParse(parsedJsonOrNull(block));
  return parsed.success ? parsed.data : null;
};

const asLocation = ({ file, line }: ReviewItem): string =>
  `${file}${line ? `:${line}` : ""}`;

const asGapList = (gaps: readonly ReviewItem[]): string =>
  gaps
    .map(
      (gap, index) =>
        `${index + 1}. ${asLocation(gap)} — ${gap.summary}\n   ${gap.why}`,
    )
    .join("\n\n");

type AfterReview =
  | { readonly next: "gates" }
  | {
      readonly next: "fix";
      readonly gaps: readonly ReviewItem[];
      readonly lastRound: boolean;
    }
  | {
      readonly next: "decide";
      readonly gaps: readonly ReviewItem[];
      readonly lastRound: boolean;
      readonly reason: string;
    };

/**
 * A fix is a fraction of what implementing costs, and each review starts fresh
 * and finds new gaps, so the last round's gaps are fixed, never parked: a park
 * throws the branch away and the retake pays to implement it all again.
 */
export const afterReview = (review: Review, pass: number): AfterReview => {
  const { specGaps } = review;
  if (specGaps.length === 0) return { next: "gates" };
  const lastRound = pass >= MAX_REVIEW_FIX_ROUNDS;
  const closable = specGaps.filter(({ needsADecision }) => !needsADecision);
  if (closable.length === 0 || (lastRound && closable.length < specGaps.length))
    return {
      next: "decide",
      gaps: specGaps,
      lastRound,
      reason: `${specGaps.length} spec gap(s) need a person's decision:\n\n${asGapList(specGaps)}`,
    };
  return { next: "fix", gaps: closable, lastRound };
};

const asFixBrief = (
  specGaps: readonly ReviewItem[],
  { title, body }: PullRequestCopy,
): string =>
  `${asGapList(specGaps)}\n\nThe PR description the harness will publish reads:\n\n<pr>\ntitle: ${title}\nbody:\n${body}\n</pr>\n\nWhen a gap is in that description, or your fix makes it wrong, end with the whole corrected <pr> block in the same shape. The harness publishes the last one you emit.`;

const asDecidedBrief = (
  decision: string,
  specGaps: readonly ReviewItem[],
  pullRequestCopy: PullRequestCopy,
): string =>
  `The brief was amended, so read the ticket again. What was decided:\n\n${decision}\n\n${asFixBrief(specGaps, pullRequestCopy)}`;

const asGateFailureBrief = ({ command, output }: GateFailure): string =>
  `The harness ran \`${command}\` and it failed. Fix it.\n\n\`\`\`\n${output}\n\`\`\``;

const EMIT_THE_REVIEW =
  "End with the <review> block the prompt describes: summary, specGaps and notes, as JSON.";
const EMIT_THE_PULL_REQUEST = `End with the <pr> block the prompt describes: a title: line, then body: and the PR description. Load the \`mattpocock-skills:pr\` skill and write the body in its template: ${PR_SKILL_SECTIONS.join(", ")}.`;

export const reviewBranch = async (
  runAgentPhase: RunAgentPhase,
  journal: Pick<Journal, "record">,
  ticket: Ticket,
  round: number | string,
  pullRequestBody: string,
  mutation: string,
): Promise<Review | null> => {
  const phase = `review#${round}`;
  const reviewer = REVIEWER;
  const reviewed = await runAgentPhase(phase, reviewer, {
    promptFile: join(PROMPT_DIR, "review.md"),
    promptArgs: {
      TICKET: String(ticket.number),
      BASE: MERGE_BASE,
      PR_BODY: pullRequestBody,
      MUTATION: mutation,
    },
    maxIterations: 1,
    idleTimeoutSeconds: AN_HOUR_IN_SECONDS,
  });
  const review = await readOrAskAgain(
    runAgentPhase,
    phase,
    reviewer,
    reviewed,
    readReviewTag,
    EMIT_THE_REVIEW,
  );

  const gaps = review?.specGaps ?? [];
  const decisions = gaps.filter(({ needsADecision }) => needsADecision).length;
  journal.record({
    phase: `${phase}:findings`,
    kind: "review",
    model: reviewer.model,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    outcome: review ? "ok" : "fail",
    detail: review ? undefined : "no readable <review> block",
    findings: {
      total: gaps.length + (review?.notes.length ?? 0),
      high: gaps.length - decisions,
      medium: decisions,
      low: review?.notes.length ?? 0,
      parsed: review !== null,
    },
  });
  return review;
};

interface Declined {
  readonly reason: string;
  readonly notThisBranch: boolean;
}

interface FixResult {
  readonly declined: Declined | null;
  readonly pullRequestCopy: PullRequestCopy | null;
}

export interface Fixer {
  readonly apply: (phase: string, brief: string) => Promise<FixResult>;
}

export const fixerFor = (
  runAgentPhase: RunAgentPhase,
  session: string | undefined,
): Fixer => {
  let sessionToResume = session;
  return {
    apply: async (phase, brief) => {
      const fixed = await runAgentPhase(phase, IMPLEMENTER, {
        promptFile: join(PROMPT_DIR, "fix.md"),
        promptArgs: { FINDINGS: brief },
        maxIterations: ITERATIONS_ALLOWED_WHEN_RESUMING_A_SESSION,
        idleTimeoutSeconds: AN_HOUR_IN_SECONDS,
        resumeSession: sessionToResume,
      });
      sessionToResume = fixed.iterations.at(-1)?.sessionId ?? sessionToResume;
      const pullRequestCopy = readPullRequestTag(fixed.stdout);
      if (fixed.commits.length > 0 || pullRequestCopy)
        return { declined: null, pullRequestCopy };
      const notThisBranch = taggedBlock(fixed.stdout, "not-this-branch");
      if (notThisBranch)
        return {
          declined: { reason: notThisBranch, notThisBranch: true },
          pullRequestCopy: null,
        };
      return {
        declined: {
          reason:
            readDeclinedTag(fixed.stdout) ??
            "the fixer changed nothing and gave no reason",
          notThisBranch: false,
        },
        pullRequestCopy: null,
      };
    },
  };
};

export interface ReviewLoop {
  readonly review: (
    pass: number,
    pullRequestBody: string,
  ) => Promise<Review | null>;
  readonly fixer: Fixer;
  readonly decide: (reason: string) => Promise<string | null>;
}

type Reviewed =
  | { readonly status: "closed"; readonly pullRequestCopy: PullRequestCopy }
  | {
      readonly status: "blocked";
      readonly reason: string;
      readonly alreadyDecided?: boolean;
    };

export const reviewUntilClosed = async (
  { review, fixer, decide }: ReviewLoop,
  firstCopy: PullRequestCopy,
): Promise<Reviewed> => {
  let pullRequestCopy = firstCopy;
  let alreadyDecided = false;

  const blocked = (reason: string): Reviewed => ({
    status: "blocked",
    reason,
    ...(alreadyDecided && { alreadyDecided }),
  });
  const decideOnce = async (reason: string): Promise<string | null> => {
    if (alreadyDecided) return null;
    alreadyDecided = true;
    return decide(reason);
  };

  for (let pass = 1; ; pass += 1) {
    say(`--- review (pass ${pass}) ---`);
    const read = await review(pass, pullRequestCopy.body);
    if (!read) {
      return blocked(
        `review pass ${pass} ended without a readable <review> block, so the branch is unreviewed`,
      );
    }
    const next = afterReview(read, pass);
    if (next.next === "gates") return { status: "closed", pullRequestCopy };

    const applyTheDecision = (decision: string) =>
      fixer.apply(
        `fix#decided${pass}`,
        asDecidedBrief(decision, next.gaps, pullRequestCopy),
      );

    say(
      `--- fix ${next.gaps.length} spec gap(s) (${pass}/${MAX_REVIEW_FIX_ROUNDS}) ---`,
    );
    let fixed: FixResult;
    if (next.next === "decide") {
      const decision = await decideOnce(next.reason);
      if (decision === null) return blocked(next.reason);
      fixed = await applyTheDecision(decision);
    } else {
      fixed = await fixer.apply(
        `fix#review${pass}`,
        asFixBrief(next.gaps, pullRequestCopy),
      );
      if (fixed.declined) {
        const reason = `${next.gaps.length} spec gap(s) stand and the fixer changed nothing:\n\n${fixed.declined.reason}\n\n${asGapList(next.gaps)}`;
        const decision = await decideOnce(reason);
        if (decision === null) return blocked(reason);
        fixed = await applyTheDecision(decision);
      }
    }
    if (fixed.declined) {
      return blocked(
        `${next.gaps.length} spec gap(s) stand after the decision:\n\n${fixed.declined.reason}\n\n${asGapList(next.gaps)}`,
      );
    }
    pullRequestCopy = fixed.pullRequestCopy ?? pullRequestCopy;
    if (next.lastRound) return { status: "closed", pullRequestCopy };
  }
};

interface WaivedGate {
  readonly command: string;
  readonly reason: string;
}

export interface GateOutcome {
  readonly blocked: string | null;
  readonly waived: readonly WaivedGate[];
}

/** The branch starts at main, so what it carries past main is the implementer's, whether or not sandcastle saw it land. */
export const commitsTheBranchCarries = async (
  sandbox: Executor,
): Promise<number> => {
  const { exitCode, stdout } = await sandbox.exec(
    "git rev-list --count origin/main..HEAD",
  );
  return exitCode === 0 ? Number(stdout.trim()) || 0 : 0;
};

export const gatesUntilGreen = async (
  sandbox: Executor,
  gates: readonly Gate[],
  journal: Pick<Journal, "record">,
  fixer: Fixer,
  label: string,
): Promise<GateOutcome> => {
  let fixRoundsUsed = 0;
  const waived: WaivedGate[] = [];
  for (let round = 1; ; round += 1) {
    say(`\n--- gate (${label}, round ${round}) ---`);
    const { failures } = await runGates(
      sandbox,
      gates.filter(({ command }) =>
        waived.every((gate) => gate.command !== command),
      ),
      {
        stopAtFirstFailure: true,
        retryAFailureOnce: true,
        onResult: (result) =>
          journal.record(
            {
              phase: `gate:${result.name}#${label}.${round}`,
              kind: "gate",
              startedAt: result.startedAt,
              durationMs: result.durationMs,
              outcome: result.outcome,
              detail: result.skippedBecause,
              command: result.command,
              exitCode: result.exitCode,
            },
            result.output,
          ),
      },
    );
    const [failure] = failures;
    if (!failure) return { blocked: null, waived };

    fixRoundsUsed += 1;
    if (fixRoundsUsed > MAX_GATE_FIX_ROUNDS) {
      return {
        blocked: `still failing \`${failure.command}\` after ${MAX_GATE_FIX_ROUNDS} fix rounds`,
        waived,
      };
    }
    say(`--- fix gate failure (${fixRoundsUsed}/${MAX_GATE_FIX_ROUNDS}) ---`);
    const { declined } = await fixer.apply(
      `fix#${label}.${round}`,
      asGateFailureBrief(failure),
    );
    if (declined) {
      say(`--- waived \`${failure.command}\`: CI decides ---`);
      waived.push({ command: failure.command, reason: declined.reason });
    }
  }
};

const unblock = async (
  runAgentPhase: RunAgentPhase,
  ticket: Ticket,
  stuckOutput: string,
): Promise<string | null> => {
  say("\n--- unblock (lead) ---");
  const read = await runAgentPhase("unblock", LEAD, {
    promptFile: join(PROMPT_DIR, "unblock.md"),
    promptArgs: {
      TICKET: String(ticket.number),
      LAST_OUTPUT: stuckOutput.slice(-LAST_OUTPUT_THE_LEAD_READS),
    },
    maxIterations: 1,
    idleTimeoutSeconds: AN_HOUR_IN_SECONDS,
  });
  return readOrAskAgain(
    runAgentPhase,
    "unblock",
    LEAD,
    read,
    readGuidanceTag,
    EMIT_THE_GUIDANCE,
  );
};

export const shipTicket = async (
  ticket: Ticket,
  journal: Journal,
  nextAdr: string,
  history: ShipHistory,
): Promise<ShipOutcome> => {
  const prepared = await prepareDelivery(ticket, history, {
    assign: ({ number }) => assignToSelf(number),
    reset: resetBranchToMain,
    open: (branch) => createUnbuiltSandbox(branch),
    sessionExists: existsSync,
  });
  const { branch, sandbox } = prepared;
  journal.setTicket(ticket, branch);
  say(
    `\n=== #${ticket.number} ${ticket.title}\n=== branch ${branch}\n=== run ${journal.runId}\n`,
  );

  const runAgentPhase = agentPhaseRunner(sandbox, journal);

  try {
    say("\n--- check brief ---");
    const brief = await analyseBeforeSetup({
      analyse: async () => {
        const result = await checkBrief(runAgentPhase, ticket);
        if (result.next === "implement" && result.brief)
          history.record({
            type: "analysis.completed",
            issue: ticket.number,
            brief: result.brief,
          });
        return result;
      },
      setup: async () => {
        const started = startClock();
        const command = SETUP_STEPS.join(" && ");
        const setup = await sandbox.exec(command);
        journal.record(
          {
            phase: "setup",
            kind: "gate",
            command,
            startedAt: started.startedAt,
            durationMs: started.elapsedMs(),
            outcome: setup.exitCode === 0 ? "ok" : "fail",
            exitCode: setup.exitCode,
          },
          setup.stdout + setup.stderr,
        );
        if (setup.exitCode !== 0)
          throw new Error(`Setup failed: ${setup.stdout}${setup.stderr}`);
      },
    });
    if (brief.next === "park")
      return { status: "blocked", reason: brief.reason, briefFails: true };

    let guidance =
      (brief.brief ? `Analyst handoff:\n${brief.brief}\n\n` : "") +
      (prepared.resumed
        ? "This delivery was interrupted. Inspect its existing commits, uncommitted changes and tests before continuing. Preserve that work; do not reset the branch or reimplement completed changes. Complete the remaining criteria and emit the PR description."
        : "");
    let implemented: Awaited<ReturnType<RunAgentPhase>>;
    for (let unblocked = false; ; unblocked = true) {
      say(
        unblocked
          ? "\n--- implement (with the lead's guidance) ---"
          : "\n--- implement ---",
      );
      implemented = await runAgentPhase(
        unblocked ? "implement:unblocked" : "implement",
        IMPLEMENTER,
        {
          promptFile: join(PROMPT_DIR, "implement.md"),
          promptArgs: {
            TICKET: String(ticket.number),
            NEXT_ADR: nextAdr,
            GUIDANCE: guidance,
          },
          maxIterations: prepared.sessionId ? 1 : 40,
          resumeSession: unblocked ? undefined : prepared.sessionId,
          idleTimeoutSeconds: AN_HOUR_IN_SECONDS,
        },
      );
      const declined = readDeclinedTag(implemented.stdout);
      const next = afterImplementing({
        commits:
          implemented.commits.length ||
          (await commitsTheBranchCarries(sandbox)),
        declined,
        unblocked,
      });
      if (next === "review") break;
      const lead =
        next === "unblock"
          ? await unblock(runAgentPhase, ticket, implemented.stdout)
          : null;
      if (!lead) {
        return {
          status: "blocked",
          reason:
            declined ??
            "the implementer produced no commits and gave no reason",
        };
      }
      guidance = `\n# The lead's guidance\n\nYour first attempt ended with no commits. The lead read it and the code:\n\n${lead}\n`;
    }

    const firstCopy =
      (await readOrAskAgain(
        runAgentPhase,
        "implement",
        IMPLEMENTER,
        implemented,
        readTemplatedPullRequest,
        EMIT_THE_PULL_REQUEST,
      )) ??
      readPullRequestTag(implemented.stdout) ??
      fallbackPullRequestCopy(ticket);
    const fixer = fixerFor(
      runAgentPhase,
      implemented.iterations.at(-1)?.sessionId,
    );

    say("--- mutation survey ---");
    const mutation = await surveyMutants(sandbox);
    const reviewed = await reviewUntilClosed(
      {
        review: (pass, pullRequestBody) =>
          reviewHead(ticket.number, history, {
            head: () => reviewableHead(sandbox),
            review: () =>
              reviewBranch(
                runAgentPhase,
                journal,
                ticket,
                pass,
                pullRequestBody,
                mutation,
              ),
          }),
        fixer,
        decide: (reason) => decideOnTheBranch(runAgentPhase, ticket, reason),
      },
      firstCopy,
    );
    if (reviewed.status === "blocked") return reviewed;
    const { pullRequestCopy } = reviewed;

    const gates = await gatesUntilGreen(
      sandbox,
      GATES,
      journal,
      fixer,
      "final",
    );
    if (gates.blocked) return { status: "blocked", reason: gates.blocked };

    say("\n--- land ---");
    const onMain = await rebaseOntoLatestMain(
      sandbox,
      syncRepoToMain,
      async () =>
        !(
          await resolveTheRebase(
            sandbox,
            runAgentPhase,
            IMPLEMENTER,
            ticket.number,
          )
        ).unfinished,
    );
    if (onMain === "resolved") {
      const regated = await gatesUntilGreen(
        sandbox,
        GATES_AFTER_A_RESOLVED_REBASE,
        journal,
        fixer,
        "resolved",
      );
      if (regated.blocked)
        return { status: "blocked", reason: regated.blocked };
    }
    if (onMain === "kept") {
      say(
        "  the latest main conflicts, so the branch is pushed as it was gated",
      );
    }
    const finalReview = await reviewHead(ticket.number, history, {
      head: () => reviewableHead(sandbox),
      review: async () =>
        reviewBranch(
          runAgentPhase,
          journal,
          ticket,
          "publish",
          pullRequestCopy.body,
          await surveyMutants(sandbox),
        ),
    });
    if (!finalReview || finalReview.specGaps.length > 0)
      return {
        status: "blocked",
        reason: finalReview
          ? `Final commit review: ${asGapList(finalReview.specGaps)}`
          : "Final commit has no readable independent review",
      };
    await pushBranch(branch, sandbox.worktreePath);
    const pullRequest = openPullRequest(
      branch,
      pullRequestCopy.title,
      pullRequestCopy.body,
    );

    history.record({ type: "pr.tracked", ticket, pullRequest });

    queueForMerge(pullRequest.number);
    return { status: "queued", pullRequest };
  } finally {
    const { preservedWorktreePath } = await closePlumixSandbox(sandbox);
    if (preservedWorktreePath)
      say(`Worktree preserved at ${preservedWorktreePath}`);
  }
};
