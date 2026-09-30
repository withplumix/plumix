import { join } from "node:path";
import { z } from "zod";

import type { RunAgentPhase, Thinker } from "./agent.js";
import type { Executor, Gate, GateFailure } from "./gates.js";
import type { QueuedPullRequest, Ticket } from "./github.js";
import type { Journal } from "./telemetry.js";
import {
  agentPhaseRunner,
  parsedJsonOrNull,
  PROMPT_DIR,
  readOrAskAgain,
  startClock,
  taggedBlock,
} from "./agent.js";
import { rebaseOntoLatestMain } from "./freshen.js";
import { CHANGESET_GATE, GATES, runGates } from "./gates.js";
import {
  assignToSelf,
  openPullRequest,
  pushBranch,
  queueForMerge,
  resetBranchToMain,
  syncRepoToMain,
} from "./github.js";
import { say } from "./log.js";
import { MERGE_BASE } from "./repo.js";
import {
  AN_HOUR_IN_SECONDS,
  closePlumixSandbox,
  createPlumixSandbox,
} from "./sandbox.js";

export const IMPLEMENTER: Thinker = {
  model: "claude-opus-5-5",
  effort: "medium",
};
const REVIEWER: Thinker = { model: "claude-sonnet-5-5", effort: "high" };

const MAX_GATE_FIX_ROUNDS = 4;
const MAX_REVIEW_FIX_ROUNDS = 3;
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

const reviewSchema = z.object({
  summary: z.string().default(""),
  specGaps: z.array(reviewItemSchema).default([]),
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

const asFixBrief = (specGaps: readonly ReviewItem[]): string =>
  specGaps
    .map(
      (gap, index) =>
        `${index + 1}. ${asLocation(gap)} — ${gap.summary}\n   ${gap.why}`,
    )
    .join("\n\n");

const asGateFailureBrief = ({ command, output }: GateFailure): string =>
  `The harness ran \`${command}\` and it failed. Fix it.\n\n\`\`\`\n${output}\n\`\`\``;

const EMIT_THE_REVIEW =
  "End with the <review> block the prompt describes: summary, specGaps and notes, as JSON.";
const EMIT_THE_PULL_REQUEST =
  "End with the <pr> block the prompt describes: a title: line, then body: and the PR description.";

export const reviewBranch = async (
  runAgentPhase: RunAgentPhase,
  journal: Pick<Journal, "record">,
  ticket: Ticket,
  round: number,
  pullRequestBody: string,
): Promise<Review | null> => {
  const phase = `review#${round}`;
  const reviewed = await runAgentPhase(phase, REVIEWER, {
    promptFile: join(PROMPT_DIR, "review.md"),
    promptArgs: {
      TICKET: String(ticket.number),
      BASE: MERGE_BASE,
      PR_BODY: pullRequestBody,
    },
    maxIterations: 1,
    idleTimeoutSeconds: AN_HOUR_IN_SECONDS,
  });
  const review = await readOrAskAgain(
    runAgentPhase,
    phase,
    REVIEWER,
    reviewed,
    readReviewTag,
    EMIT_THE_REVIEW,
  );

  journal.record({
    phase: `${phase}:findings`,
    kind: "review",
    model: REVIEWER.model,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    outcome: review ? "ok" : "fail",
    detail: review ? undefined : "no readable <review> block",
    findings: {
      total: (review?.specGaps.length ?? 0) + (review?.notes.length ?? 0),
      high: review?.specGaps.length ?? 0,
      medium: 0,
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

export interface Fixer {
  readonly apply: (phase: string, brief: string) => Promise<Declined | null>;
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
      if (fixed.commits.length > 0) return null;
      const notThisBranch = taggedBlock(fixed.stdout, "not-this-branch");
      if (notThisBranch) return { reason: notThisBranch, notThisBranch: true };
      return {
        reason:
          readDeclinedTag(fixed.stdout) ??
          "the fixer changed nothing and gave no reason",
        notThisBranch: false,
      };
    },
  };
};

interface WaivedGate {
  readonly command: string;
  readonly reason: string;
}

export interface GateOutcome {
  readonly blocked: string | null;
  readonly waived: readonly WaivedGate[];
}

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
          journal.record({
            phase: `gate:${result.name}#${label}.${round}`,
            kind: "gate",
            startedAt: result.startedAt,
            durationMs: result.durationMs,
            outcome: result.outcome,
            detail: result.skippedBecause,
            command: result.command,
            exitCode: result.exitCode,
          }),
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
    const declined = await fixer.apply(
      `fix#${label}.${round}`,
      asGateFailureBrief(failure),
    );
    if (declined) {
      say(`--- waived \`${failure.command}\`: CI decides ---`);
      waived.push({ command: failure.command, reason: declined.reason });
    }
  }
};

export const asReviewNote = (
  summaries: readonly string[],
  notes: readonly ReviewItem[],
): string => {
  const changed = summaries.filter((summary) => summary.length > 0);
  if (changed.length === 0 && notes.length === 0) return "";
  const lines = [
    ...changed.map((summary) => `- ${summary}`),
    ...notes.map(
      (note) =>
        `- Left \`${asLocation(note)}\` — ${note.summary}${note.why ? `: ${note.why}` : ""}`,
    ),
  ];
  return `\n\n---\n\n### Review\n\n${lines.join("\n")}`;
};

export const asWaivedGatesNote = (waived: readonly WaivedGate[]): string =>
  waived.length === 0
    ? ""
    : `\n\n---\n\n### Local gates the fixer did not attribute to this branch\n\n${waived
        .map(
          ({ command, reason }) =>
            `<details><summary><code>${command}</code></summary>\n\n${reason}\n\n</details>`,
        )
        .join(
          "\n\n",
        )}\n\nCI runs them again; a real failure there goes through repair.`;

export const shipTicket = async (
  ticket: Ticket,
  journal: Journal,
  nextAdr: string,
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
    say("\n--- implement ---");
    const implemented = await runAgentPhase("implement", IMPLEMENTER, {
      promptFile: join(PROMPT_DIR, "implement.md"),
      promptArgs: { TICKET: String(ticket.number), NEXT_ADR: nextAdr },
      maxIterations: 40,
      idleTimeoutSeconds: AN_HOUR_IN_SECONDS,
    });
    if (!implemented.commits.length) {
      return {
        status: "blocked",
        reason:
          readDeclinedTag(implemented.stdout) ??
          "the implementer produced no commits and gave no reason",
      };
    }

    const pullRequestCopy =
      (await readOrAskAgain(
        runAgentPhase,
        "implement",
        IMPLEMENTER,
        implemented,
        readPullRequestTag,
        EMIT_THE_PULL_REQUEST,
      )) ?? fallbackPullRequestCopy(ticket);
    const fixer = fixerFor(
      runAgentPhase,
      implemented.iterations.at(-1)?.sessionId,
    );
    const summaries: string[] = [];
    let notes: readonly ReviewItem[] = [];

    for (let pass = 1; ; pass += 1) {
      say(`--- review (pass ${pass}) ---`);
      const review = await reviewBranch(
        runAgentPhase,
        journal,
        ticket,
        pass,
        pullRequestCopy.body,
      );
      if (!review) {
        return {
          status: "blocked",
          reason: `review pass ${pass} ended without a readable <review> block, so the branch is unreviewed`,
        };
      }
      summaries.push(review.summary);
      notes = review.notes;
      if (review.specGaps.length === 0) break;

      if (pass > MAX_REVIEW_FIX_ROUNDS) {
        return {
          status: "blocked",
          reason: `${review.specGaps.length} spec gap(s) still open after ${MAX_REVIEW_FIX_ROUNDS} review rounds`,
        };
      }
      say(
        `--- fix ${review.specGaps.length} spec gap(s) (${pass}/${MAX_REVIEW_FIX_ROUNDS}) ---`,
      );
      const declined = await fixer.apply(
        `fix#review${pass}`,
        asFixBrief(review.specGaps),
      );
      if (declined) {
        return {
          status: "blocked",
          reason: `${review.specGaps.length} spec gap(s) stand and the fixer changed nothing:\n\n${declined.reason}`,
        };
      }
    }

    const gates = await gatesUntilGreen(
      sandbox,
      [...GATES, CHANGESET_GATE],
      journal,
      fixer,
      "final",
    );
    if (gates.blocked) return { status: "blocked", reason: gates.blocked };

    say("\n--- land ---");
    const onMain = await rebaseOntoLatestMain(sandbox, syncRepoToMain);
    if (onMain === "kept") {
      say(
        "  the latest main conflicts, so the branch is pushed as it was gated",
      );
    }
    await pushBranch(branch, sandbox.worktreePath);
    const pullRequest = openPullRequest(
      branch,
      pullRequestCopy.title,
      pullRequestCopy.body +
        asReviewNote(summaries, notes) +
        asWaivedGatesNote(gates.waived),
    );

    queueForMerge(pullRequest.number);
    return { status: "queued", pullRequest };
  } finally {
    const { preservedWorktreePath } = await closePlumixSandbox(sandbox);
    if (preservedWorktreePath)
      say(`Worktree preserved at ${preservedWorktreePath}`);
  }
};
