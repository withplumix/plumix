import type { QueuedPullRequest, Ticket } from "./lib/github.js";
import type { Finding, ShipOutcome } from "./lib/ticket.js";
import { gateBehindCheck } from "./lib/gates.js";
import {
  closeCompletedParent,
  fileFollowUp,
  firstUnblockedUnassignedTicket,
  isTicketClosed,
  parentsWithEveryChildClosed,
  parkTicket,
  releaseClaim,
  syncRepoToMain,
  ticketByNumber,
  waitForMerge,
} from "./lib/github.js";
import { drainAcrossLanes } from "./lib/lanes.js";
import { say } from "./lib/log.js";
import { looksLikeAnOutage } from "./lib/outage.js";
import { Journal } from "./lib/telemetry.js";
import { shipTicket } from "./lib/ticket.js";

const DEFAULT_BUDGET_HOURS = 8;
const DEFAULT_LANES = 2;
const MERGE_POLL_INTERVAL_MS = 120_000;
const MERGE_GIVE_UP_AFTER_MS = 2_700_000;
const MINIMUM_TIME_TO_START_ANOTHER_TICKET_MS = 75 * 60_000;

interface ShipOptions {
  readonly onlyTicket?: number;
  readonly lanes: number;
  readonly budgetMs: number;
}

const flag = (argv: readonly string[], name: string): string | undefined =>
  argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");

const readOptions = (argv: readonly string[]): ShipOptions => {
  const onlyTicket = argv.find((arg) => /^\d+$/.test(arg));
  return {
    onlyTicket: onlyTicket ? Number(onlyTicket) : undefined,
    lanes: Number(flag(argv, "lanes") ?? DEFAULT_LANES),
    budgetMs: Number(flag(argv, "hours") ?? DEFAULT_BUDGET_HOURS) * 3_600_000,
  };
};

const asDuration = (ms: number): string => {
  const minutes = Math.round(ms / 60_000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`
    : `${minutes}m`;
};

interface ShipResult {
  readonly ticket: Ticket;
  readonly outcome: ShipOutcome;
}

const { onlyTicket, lanes, budgetMs } = readOptions(process.argv.slice(2));
const endOfBudget = Date.now() + budgetMs;
const claimed = new Set<number>();
let outage: string | undefined;

say(
  `Ship run — budget ${asDuration(budgetMs)}, ${lanes} lane(s), ends ${new Date(endOfBudget).toLocaleTimeString()}`,
);

syncRepoToMain();

const takeNextTicket = (): Ticket | undefined => {
  const candidate = onlyTicket
    ? ticketByNumber(onlyTicket)
    : firstUnblockedUnassignedTicket(claimed);
  if (!candidate || claimed.has(candidate.number)) return undefined;
  claimed.add(candidate.number);
  return candidate;
};

const laneCount = Math.max(1, onlyTicket ? 1 : lanes);
const results = await drainAcrossLanes<Ticket, ShipResult>({
  lanes: laneCount,
  nextItem: takeNextTicket,
  stopDispatchingWhen: () =>
    outage !== undefined ||
    endOfBudget - Date.now() < MINIMUM_TIME_TO_START_ANOTHER_TICKET_MS,
  inLane: async (ticket) => {
    const journal = new Journal(import.meta.dirname);
    let outcome: ShipOutcome;
    try {
      outcome = await shipTicket(ticket, journal);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (looksLikeAnOutage(reason)) {
        journal.finish("failed", reason);
        releaseClaim(ticket.number);
        outage ??= reason;
        say(`  #${ticket.number} → left for the next run: ${reason}`);
        return { ticket, outcome: { status: "blocked", reason } };
      }
      outcome = { status: "blocked", reason };
    }

    if (outcome.status === "queued") {
      journal.finish("shipped");
    } else {
      journal.finish("failed", outcome.reason);
      parkTicket(ticket.number, outcome.reason, outcome.pullRequestUrl);
    }
    return { ticket, outcome };
  },
});

interface Landing {
  readonly ticket: Ticket;
  readonly pullRequest: QueuedPullRequest;
  readonly merged: boolean;
  readonly reason?: string;
}

const confirmLanding = async (
  ticket: Ticket,
  pullRequest: QueuedPullRequest,
  advisory: readonly Finding[],
): Promise<Landing> => {
  const merge = await waitForMerge(pullRequest.number, {
    pollEveryMs: MERGE_POLL_INTERVAL_MS,
    giveUpAfterMs: MERGE_GIVE_UP_AFTER_MS,
    onPoll: (status) => say(`  #${ticket.number} ${status}`),
  });

  if (merge.status !== "merged") {
    const noLocalGateMirrors = merge.failingChecks.filter(
      (name) => !gateBehindCheck(name),
    );
    if (noLocalGateMirrors.length > 0) {
      say(
        `  #${ticket.number} CI checks with no local gate: ${noLocalGateMirrors.join(", ")}`,
      );
    }
    parkTicket(ticket.number, merge.reason, pullRequest.url);
    return { ticket, pullRequest, merged: false, reason: merge.reason };
  }

  if (!isTicketClosed(ticket.number)) {
    say(
      `  warning: #${ticket.number} did not close — check the PR body's Fixes reference`,
    );
  }
  for (const finding of advisory) {
    fileFollowUp(ticket.number, pullRequest.url, finding);
    say(
      `  #${ticket.number} filed a follow-up: ${finding.summary.slice(0, 64)}`,
    );
  }
  return { ticket, pullRequest, merged: true };
};

const queued = results.flatMap(({ ticket, outcome }) =>
  outcome.status === "queued"
    ? [{ ticket, pullRequest: outcome.pullRequest, advisory: outcome.advisory }]
    : [],
);

say(`\n--- confirming ${queued.length} queued pull request(s) ---`);
const landings = await Promise.all(
  queued.map(({ ticket, pullRequest, advisory }) =>
    confirmLanding(ticket, pullRequest, advisory),
  ),
);

syncRepoToMain();
for (const parent of parentsWithEveryChildClosed()) {
  closeCompletedParent(parent.number);
  say(`  closed parent #${parent.number} — every sub-issue done`);
}

const merged = landings.filter(({ merged: m }) => m);
const parkedAtLanding = landings.filter(({ merged: m }) => !m);
const parkedInLane = results.filter(
  ({ outcome }) => outcome.status === "blocked",
);

say(`\n${"=".repeat(60)}`);
if (outage) {
  say(`Stopped early — nothing the tickets did:\n  ${outage}`);
  say(
    `Every ticket still in flight kept its label, so the next run takes them.`,
  );
}
say(
  `Merged ${merged.length}, parked ${parkedInLane.length + parkedAtLanding.length}, ` +
    `${asDuration(Math.max(0, endOfBudget - Date.now()))} of budget unused.`,
);
for (const { ticket, pullRequest } of merged)
  say(`  \u2713 #${ticket.number} ${pullRequest.url}`);
for (const { ticket, outcome } of parkedInLane)
  if (outcome.status === "blocked")
    say(`  \u2691 #${ticket.number} — ${outcome.reason}`);
for (const { ticket, pullRequest, reason } of parkedAtLanding)
  say(`  \u2691 #${ticket.number} ${pullRequest.url} — ${reason}`);
