import type { Thinker } from "./lib/agent.js";
import type { TriageCandidate } from "./lib/github.js";
import type { IssueShape, TriageModels, TriageOutcome } from "./lib/triage.js";
import { agentPhaseRunner } from "./lib/agent.js";
import {
  askOnIssue,
  blockIssueOn,
  closeAlreadyResolved,
  listTriageCandidates,
  promoteToReadyForAgent,
  readyForAgentCount,
  resetBranchToMain,
  syncRepoToMain,
} from "./lib/github.js";
import { drainAcrossLanes, drainingFrom } from "./lib/lanes.js";
import { say } from "./lib/log.js";
import { looksLikeAnOutage } from "./lib/outage.js";
import { closePlumixSandbox, createReadOnlySandbox } from "./lib/sandbox.js";
import { Journal } from "./lib/telemetry.js";
import {
  awaitingAnAnswer,
  blockerEdges,
  classifyIssueBody,
  DEFAULT_TRIAGE_MODELS,
  triageIssue,
} from "./lib/triage.js";

const DEFAULT_BUDGET_HOURS = 8;
const DEFAULT_QUEUE_DEPTH = 12;
const DEFAULT_LANES = 3;

const SHAPE_ORDER: readonly IssueShape[] = ["specified", "unspecified"];

interface TriageOptions {
  readonly onlyIssue?: number;
  readonly limit: number;
  readonly queueDepth: number;
  readonly lanes: number;
  readonly budgetMs: number;
  readonly dryRun: boolean;
  readonly models: TriageModels;
}

const flag = (argv: readonly string[], name: string): string | undefined =>
  argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");

const readOptions = (argv: readonly string[]): TriageOptions => {
  const onlyIssue = argv.find((arg) => /^\d+$/.test(arg));
  return {
    onlyIssue: onlyIssue ? Number(onlyIssue) : undefined,
    limit: Number(flag(argv, "limit") ?? Infinity),
    queueDepth: Number(flag(argv, "queue-depth") ?? DEFAULT_QUEUE_DEPTH),
    lanes: Number(flag(argv, "lanes") ?? DEFAULT_LANES),
    budgetMs: Number(flag(argv, "hours") ?? DEFAULT_BUDGET_HOURS) * 3_600_000,
    dryRun: argv.includes("--dry-run"),
    models: {
      assess: thinker(DEFAULT_TRIAGE_MODELS.assess, flag(argv, "assess")),
      coldReader: thinker(
        DEFAULT_TRIAGE_MODELS.coldReader,
        flag(argv, "cold-reader"),
      ),
    },
  };
};

const thinker = (fallback: Thinker, spec: string | undefined): Thinker => {
  const [model, effort] = (spec ?? "").split("@");
  return {
    model: model || fallback.model,
    effort: (effort as Thinker["effort"]) || fallback.effort,
  };
};

const asDuration = (ms: number): string => {
  const minutes = Math.round(ms / 60_000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`
    : `${minutes}m`;
};

const queueInPriorityOrder = (
  candidates: readonly TriageCandidate[],
): readonly TriageCandidate[] =>
  SHAPE_ORDER.flatMap((shape) =>
    candidates.filter(
      ({ body, comments }) =>
        classifyIssueBody(body) === shape && !awaitingAnAnswer(comments),
    ),
  );

interface TriageResult {
  readonly issue: TriageCandidate;
  readonly outcome: TriageOutcome;
}

const { onlyIssue, limit, queueDepth, lanes, budgetMs, dryRun, models } =
  readOptions(process.argv.slice(2));
const endOfBudget = Date.now() + budgetMs;

syncRepoToMain();

const candidates = listTriageCandidates();
const queue = (
  onlyIssue
    ? candidates.filter(({ number }) => number === onlyIssue)
    : queueInPriorityOrder(candidates)
).slice(0, limit);

const shapes = candidates.reduce<Record<string, number>>((tally, { body }) => {
  const shape = classifyIssueBody(body);
  return { ...tally, [shape]: (tally[shape] ?? 0) + 1 };
}, {});
const alreadyAsked = candidates.filter(({ comments }) =>
  awaitingAnAnswer(comments),
).length;

say(
  `Triage run — ${candidates.length} in needs-triage ` +
    `(${SHAPE_ORDER.map((shape) => `${shapes[shape] ?? 0} ${shape}`).join(", ")}, ` +
    `${shapes["open-decision"] ?? 0} open-decision left for a human, ` +
    `${alreadyAsked} already asked and unanswered)`,
);

const laneCount = Math.max(1, Math.min(lanes, queue.length));
say(
  `Budget ${asDuration(budgetMs)}, ${laneCount} lane(s), ` +
    `filling the ship queue to ${queueDepth}` +
    `${dryRun ? ", DRY RUN — nothing is written to GitHub" : ""}`,
);

const readyBeforeTheRun = readyForAgentCount();
let outage: string | undefined;
const branchTokenThatOutlivesAnInterruptedRun = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .slice(0, 19);
const sandboxes = await Promise.all(
  Array.from({ length: laneCount }, (_, lane) => {
    const branch = `triage/run-${branchTokenThatOutlivesAnInterruptedRun}-lane-${lane}`;
    resetBranchToMain(branch);
    return createReadOnlySandbox(branch);
  }),
);

const promotedSoFar = (settled: readonly TriageResult[]): number =>
  settled.filter(({ outcome }) => outcome.status === "promoted").length;

const results = await drainAcrossLanes<TriageCandidate, TriageResult>({
  nextItem: drainingFrom(queue),
  lanes: laneCount,
  stopDispatchingWhen: (settled) =>
    outage !== undefined ||
    Date.now() > endOfBudget ||
    (!onlyIssue && readyBeforeTheRun + promotedSoFar(settled) >= queueDepth),
  inLane: async (issue, lane) => {
    say(`\n=== #${issue.number} ${issue.title}`);
    const journal = new Journal(import.meta.dirname);
    journal.setTicket({ number: issue.number, title: issue.title });

    let outcome: TriageOutcome;
    try {
      const sandbox = sandboxes[lane];
      if (!sandbox) throw new Error(`lane ${lane} has no sandbox`);
      outcome = await triageIssue(
        issue,
        agentPhaseRunner(sandbox, journal),
        sandbox,
        journal,
        models,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (looksLikeAnOutage(reason)) outage ??= reason;
      outcome = { status: "skipped", reason };
    }

    journal.finish(outcome.status);

    say(`  #${issue.number} → ${outcome.status}`);
    if (!dryRun) {
      if (outcome.status === "promoted")
        promoteToReadyForAgent(issue.number, outcome.brief);
      if (outcome.status === "closed")
        closeAlreadyResolved(issue.number, outcome.evidence);
      if (outcome.status === "questioned")
        askOnIssue(issue.number, outcome.questions);
    }

    return { issue, outcome };
  },
});

await Promise.all(sandboxes.map((sandbox) => closePlumixSandbox(sandbox)));

const promoted = results.flatMap(({ issue, outcome }) =>
  outcome.status === "promoted"
    ? [{ number: issue.number, touches: outcome.touches }]
    : [],
);
const edges = blockerEdges(promoted);
if (!dryRun) {
  for (const { ticket, blockedBy } of edges) blockIssueOn(ticket, blockedBy);
}

const numbersWithStatus = (status: TriageOutcome["status"]) =>
  results
    .filter(({ outcome }) => outcome.status === status)
    .map(({ issue }) => issue.number);

say(`\n${"=".repeat(60)}`);
if (outage) {
  say(`Stopped early — nothing the issues did:\n  ${outage}`);
}
say(
  `Promoted ${promoted.length}, closed ${numbersWithStatus("closed").length}, ` +
    `questioned ${numbersWithStatus("questioned").length}, ` +
    `skipped ${numbersWithStatus("skipped").length}, ` +
    `${edges.length} blocked-by edge(s).`,
);
for (const { number } of promoted) say(`  ✓ #${number} ready-for-agent`);
for (const number of numbersWithStatus("closed"))
  say(`  ⊘ #${number} already resolved`);
for (const number of numbersWithStatus("questioned"))
  say(`  ? #${number} needs-info`);
for (const { issue, outcome } of results)
  if (outcome.status === "skipped")
    say(`  ⚑ #${issue.number} — ${outcome.reason}`);
for (const { ticket, blockedBy } of edges)
  say(`  ⇢ #${ticket} blocked by #${blockedBy}`);
