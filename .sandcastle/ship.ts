import type { QueuedPullRequest, Ticket } from "./lib/github.js";
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
import { say } from "./lib/log.js";
import { runShipLoop } from "./lib/run.js";
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

const { onlyTicket, lanes, budgetMs } = readOptions(process.argv.slice(2));
const endOfBudget = Date.now() + budgetMs;
const claimed = new Set<number>();
const laneCount = Math.max(1, onlyTicket ? 1 : lanes);

say(
  `Ship run — budget ${asDuration(budgetMs)}, ${laneCount} lane(s), ends ${new Date(endOfBudget).toLocaleTimeString()}`,
);

syncRepoToMain();

const report = await runShipLoop(
  {
    nextTicket: () => {
      const candidate = onlyTicket
        ? ticketByNumber(onlyTicket)
        : firstUnblockedUnassignedTicket(claimed);
      if (!candidate || claimed.has(candidate.number)) return undefined;
      claimed.add(candidate.number);
      return candidate;
    },
    ship: (ticket) => {
      const journal = new Journal(import.meta.dirname);
      return shipTicket(ticket, journal).then(
        (outcome) => {
          journal.finish(outcome.status === "queued" ? "shipped" : "failed");
          return outcome;
        },
        (error: unknown) => {
          journal.finish("failed", String(error));
          throw error;
        },
      );
    },
    park: ({ number }, reason, pullRequestUrl) =>
      parkTicket(number, reason, pullRequestUrl),
    releaseClaim: ({ number }) => releaseClaim(number),
    confirm: (pullRequest) =>
      waitForMerge(pullRequest.number, {
        pollEveryMs: MERGE_POLL_INTERVAL_MS,
        giveUpAfterMs: MERGE_GIVE_UP_AFTER_MS,
        onPoll: (status) => say(`  #${pullRequest.number} ${status}`),
      }),
    fileFollowUp: ({ number }, pullRequestUrl, finding) =>
      fileFollowUp(number, pullRequestUrl, finding),
    ticketClosed: ({ number }) => isTicketClosed(number),
    say,
  },
  {
    lanes: laneCount,
    withinBudget: () =>
      endOfBudget - Date.now() >= MINIMUM_TIME_TO_START_ANOTHER_TICKET_MS,
  },
);

syncRepoToMain();
for (const parent of parentsWithEveryChildClosed()) {
  closeCompletedParent(parent.number);
  say(`  closed parent #${parent.number} — every sub-issue done`);
}

say(`\n${"=".repeat(60)}`);
if (report.stoppedBecause) say(`Stopped early — ${report.stoppedBecause}`);
if (report.outage) {
  say(`Stopped early — nothing the tickets did:\n  ${report.outage}`);
  say(
    `Every ticket still in flight kept its label, so the next run takes them.`,
  );
}
say(
  `Merged ${report.merged.length}, parked ${report.parked.length}, ` +
    `${asDuration(Math.max(0, endOfBudget - Date.now()))} of budget unused.`,
);
for (const { ticket, pullRequest } of report.merged)
  say(`  \u2713 #${ticket.number} ${pullRequest.url}`);
for (const { ticket, reason } of report.parked)
  say(`  \u2691 #${ticket.number} — ${reason}`);
