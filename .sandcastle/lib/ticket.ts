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
import { checkBrief } from "./brief-check.js";
import { rebaseOntoLatestMain } from "./freshen.js";
import { GATES, runGates } from "./gates.js";
import {
  assignToSelf,
  openPullRequest,
  parkTicket,
  pushBranch,
  queueForMerge,
  resetBranchToMain,
  subIssuesOf,
  syncRepoToMain,
} from "./github.js";
import { say } from "./log.js";
import { surveyMutants } from "./mutation.js";
import { nextSubIssue, prdPullRequestCopy } from "./prd.js";
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
      readonly briefFails?: boolean;
    }
  | { readonly status: "skipped"; readonly reason: string };

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
  | { readonly next: "fix"; readonly gaps: readonly ReviewItem[] }
  | { readonly next: "park"; readonly reason: string };

export const afterReview = (review: Review, pass: number): AfterReview => {
  const { specGaps } = review;
  if (specGaps.length === 0) return { next: "gates" };
  const closable = specGaps.filter(({ needsADecision }) => !needsADecision);
  if (closable.length === 0) {
    return {
      next: "park",
      reason: `${specGaps.length} spec gap(s) need a person's decision:\n\n${asGapList(specGaps)}`,
    };
  }
  if (pass > MAX_REVIEW_FIX_ROUNDS) {
    return {
      next: "park",
      reason: `${specGaps.length} spec gap(s) still open after ${MAX_REVIEW_FIX_ROUNDS} review rounds:\n\n${asGapList(specGaps)}`,
    };
  }
  return { next: "fix", gaps: closable };
};

const asFixBrief = (
  specGaps: readonly ReviewItem[],
  { title, body }: PullRequestCopy,
): string =>
  `${asGapList(specGaps)}\n\nThe PR description the harness will publish reads:\n\n<pr>\ntitle: ${title}\nbody:\n${body}\n</pr>\n\nWhen a gap is in that description, or your fix makes it wrong, end with the whole corrected <pr> block in the same shape. The harness publishes the last one you emit.`;

const asGateFailureBrief = ({ command, output }: GateFailure): string =>
  `The harness ran \`${command}\` and it failed. Fix it.\n\n\`\`\`\n${output}\n\`\`\``;

const EMIT_THE_REVIEW =
  "End with the <review> block the prompt describes: summary, specGaps and notes, as JSON.";
const EMIT_THE_PULL_REQUEST = `End with the <pr> block the prompt describes: a title: line, then body: and the PR description. Load the \`mattpocock-skills:pr\` skill and write the body in its template: ${PR_SKILL_SECTIONS.join(", ")}.`;

export const reviewBranch = async (
  runAgentPhase: RunAgentPhase,
  journal: Pick<Journal, "record">,
  ticket: Ticket,
  round: number,
  pullRequestBody: string,
  mutation: string,
): Promise<Review | null> => {
  const phase = `review#${round}`;
  const reviewed = await runAgentPhase(phase, REVIEWER, {
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
    REVIEWER,
    reviewed,
    readReviewTag,
    EMIT_THE_REVIEW,
  );

  const gaps = review?.specGaps ?? [];
  const decisions = gaps.filter(({ needsADecision }) => needsADecision).length;
  journal.record({
    phase: `${phase}:findings`,
    kind: "review",
    model: REVIEWER.model,
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

const branchFor = (ticket: Ticket): string =>
  `feat/${ticket.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}-${ticket.number}`;

type ImplementedOne =
  | {
      readonly status: "implemented";
      readonly copy: PullRequestCopy;
      readonly sessionId: string | undefined;
    }
  | {
      readonly status: "blocked";
      readonly reason: string;
      readonly briefFails?: boolean;
    };

const implementOne = async (
  sandbox: Executor,
  runAgentPhase: RunAgentPhase,
  ticket: Ticket,
  nextAdr: string,
  {
    phaseSuffix,
    prdNote,
    briefBase,
  }: { phaseSuffix: string; prdNote: string; briefBase: string },
): Promise<ImplementedOne> => {
  say(`\n--- check brief${phaseSuffix} ---`);
  const brief = await checkBrief(runAgentPhase, ticket, say, {
    phase: `check-brief${phaseSuffix}`,
    base: briefBase,
  });
  if (brief.next === "park")
    return { status: "blocked", reason: brief.reason, briefFails: true };

  const carriedBefore = await commitsTheBranchCarries(sandbox);
  const phase = `implement${phaseSuffix}`;
  say(`\n--- ${phase} ---`);
  const implemented = await runAgentPhase(phase, IMPLEMENTER, {
    promptFile: join(PROMPT_DIR, "implement.md"),
    promptArgs: {
      TICKET: String(ticket.number),
      NEXT_ADR: nextAdr,
      PRD_NOTE: prdNote,
    },
    maxIterations: 40,
    idleTimeoutSeconds: AN_HOUR_IN_SECONDS,
  });
  if (
    !implemented.commits.length &&
    (await commitsTheBranchCarries(sandbox)) === carriedBefore
  ) {
    return {
      status: "blocked",
      reason:
        readDeclinedTag(implemented.stdout) ??
        "the implementer produced no commits and gave no reason",
    };
  }

  const copy =
    (await readOrAskAgain(
      runAgentPhase,
      phase,
      IMPLEMENTER,
      implemented,
      readTemplatedPullRequest,
      EMIT_THE_PULL_REQUEST,
    )) ??
    readPullRequestTag(implemented.stdout) ??
    fallbackPullRequestCopy(ticket);
  return {
    status: "implemented",
    copy,
    sessionId: implemented.iterations.at(-1)?.sessionId,
  };
};

const reviewGateAndLand = async (
  sandbox: Awaited<ReturnType<typeof createPlumixSandbox>>,
  runAgentPhase: RunAgentPhase,
  journal: Journal,
  ticket: Ticket,
  branch: string,
  implementedCopy: PullRequestCopy,
  implementerSessionId: string | undefined,
): Promise<ShipOutcome> => {
  let pullRequestCopy = implementedCopy;
  const fixer = fixerFor(runAgentPhase, implementerSessionId);
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
      await surveyMutants(sandbox),
    );
    if (!review) {
      return {
        status: "blocked",
        reason: `review pass ${pass} ended without a readable <review> block, so the branch is unreviewed`,
      };
    }
    summaries.push(review.summary);
    notes = review.notes;
    const next = afterReview(review, pass);
    if (next.next === "gates") break;
    if (next.next === "park") return { status: "blocked", reason: next.reason };

    say(
      `--- fix ${next.gaps.length} spec gap(s) (${pass}/${MAX_REVIEW_FIX_ROUNDS}) ---`,
    );
    const fixed = await fixer.apply(
      `fix#review${pass}`,
      asFixBrief(next.gaps, pullRequestCopy),
    );
    pullRequestCopy = fixed.pullRequestCopy ?? pullRequestCopy;
    const { declined } = fixed;
    if (declined) {
      return {
        status: "blocked",
        reason: `${next.gaps.length} spec gap(s) stand and the fixer changed nothing:\n\n${declined.reason}\n\n${asGapList(next.gaps)}`,
      };
    }
  }

  const gates = await gatesUntilGreen(sandbox, GATES, journal, fixer, "final");
  if (gates.blocked) return { status: "blocked", reason: gates.blocked };

  say("\n--- land ---");
  const onMain = await rebaseOntoLatestMain(sandbox, syncRepoToMain);
  if (onMain === "kept") {
    say("  the latest main conflicts, so the branch is pushed as it was gated");
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
};

/** More makes a pull request too large to review; the rest ship as the next batch once it merges. */
const SUB_ISSUES_A_PRD_PULL_REQUEST_CARRIES = 5;

const PRD_NOTE_FOR = (prd: Ticket, earlier: readonly Ticket[]): string =>
  [
    `This ticket is one sub-issue of PRD #${prd.number} (\`gh issue view ${prd.number}\`). The harness implements the PRD's sub-issues one after another on this one branch and opens one pull request for them all.`,
    earlier.length
      ? `This branch already carries ${earlier.map(({ number }) => `#${number}`).join(", ")}: build on that work, do not redo or rewrite it, and do not start any other sub-issue.`
      : "Implement only this sub-issue; the harness hands you the next one after it.",
  ].join(" ");

const shipPrd = async (
  prd: Ticket,
  journal: Journal,
  nextAdr: string,
): Promise<ShipOutcome> => {
  const branch = branchFor(prd);
  journal.setTicket(prd, branch);
  say(
    `\n=== PRD #${prd.number} ${prd.title}\n=== branch ${branch}\n=== run ${journal.runId}\n`,
  );

  assignToSelf(prd.number);
  resetBranchToMain(branch);
  const sandbox = await createPlumixSandbox(branch);
  const runAgentPhase = agentPhaseRunner(sandbox, journal);
  const done: { ticket: Ticket; copy: PullRequestCopy }[] = [];
  let lastSessionId: string | undefined;
  let stoppedBecause: string | undefined;

  try {
    while (done.length < SUB_ISSUES_A_PRD_PULL_REQUEST_CARRIES) {
      const next = nextSubIssue(
        subIssuesOf(prd.number),
        new Set(done.map(({ ticket }) => ticket.number)),
      );
      if (!next) break;
      const sub: Ticket = { number: next.number, title: next.title };
      assignToSelf(sub.number);
      say(`\n=== sub-issue #${sub.number} ${sub.title}`);
      const one = await implementOne(sandbox, runAgentPhase, sub, nextAdr, {
        phaseSuffix: `#${sub.number}`,
        prdNote: PRD_NOTE_FOR(
          prd,
          done.map(({ ticket }) => ticket),
        ),
        briefBase: done.length ? "HEAD" : MERGE_BASE,
      });
      if (one.status === "blocked") {
        parkTicket(sub.number, one.reason, undefined, one.briefFails);
        stoppedBecause = `#${sub.number} was parked: ${one.reason}`;
        say(`  ${stoppedBecause}`);
        break;
      }
      done.push({ ticket: sub, copy: one.copy });
      lastSessionId = one.sessionId;
    }

    if (done.length === 0) {
      return {
        status: "skipped",
        reason: stoppedBecause ?? "no sub-issue of the PRD was ready",
      };
    }
    return await reviewGateAndLand(
      sandbox,
      runAgentPhase,
      journal,
      prd,
      branch,
      prdPullRequestCopy(prd, done),
      lastSessionId,
    );
  } finally {
    const { preservedWorktreePath } = await closePlumixSandbox(sandbox);
    if (preservedWorktreePath)
      say(`Worktree preserved at ${preservedWorktreePath}`);
  }
};

export const shipTicket = async (
  ticket: Ticket,
  journal: Journal,
  nextAdr: string,
): Promise<ShipOutcome> => {
  if (ticket.prd) return shipPrd(ticket, journal, nextAdr);
  const branch = branchFor(ticket);
  journal.setTicket(ticket, branch);
  say(
    `\n=== #${ticket.number} ${ticket.title}\n=== branch ${branch}\n=== run ${journal.runId}\n`,
  );

  assignToSelf(ticket.number);
  resetBranchToMain(branch);
  const sandbox = await createPlumixSandbox(branch);
  const runAgentPhase = agentPhaseRunner(sandbox, journal);

  try {
    const one = await implementOne(sandbox, runAgentPhase, ticket, nextAdr, {
      phaseSuffix: "",
      prdNote: "",
      briefBase: MERGE_BASE,
    });
    if (one.status === "blocked") return one;
    return await reviewGateAndLand(
      sandbox,
      runAgentPhase,
      journal,
      ticket,
      branch,
      one.copy,
      one.sessionId,
    );
  } finally {
    const { preservedWorktreePath } = await closePlumixSandbox(sandbox);
    if (preservedWorktreePath)
      say(`Worktree preserved at ${preservedWorktreePath}`);
  }
};
