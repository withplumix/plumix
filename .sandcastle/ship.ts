import {
  closeCompletedParent,
  parentsWithEveryChildClosed,
  parkTicket,
  syncRepoToMain,
  firstUnblockedUnassignedTicket,
  ticketByNumber,
} from "./lib/github.js";
import type { Ticket } from "./lib/github.js";
import { drainAcrossLanes } from "./lib/lanes.js";
import { say } from "./lib/log.js";
import { Journal } from "./lib/telemetry.js";
import type { ShipOutcome } from "./lib/ticket.js";
import { shipTicket } from "./lib/ticket.js";

const DEFAULT_BUDGET_HOURS = 8;
const DEFAULT_LANES = 2;
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
    endOfBudget - Date.now() < MINIMUM_TIME_TO_START_ANOTHER_TICKET_MS,
  inLane: async (ticket) => {
    const journal = new Journal(import.meta.dirname);
    let outcome: ShipOutcome;
    try {
      outcome = await shipTicket(ticket, journal);
    } catch (error) {
      outcome = {
        status: "blocked",
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    if (outcome.status === "shipped") {
      journal.finish("shipped");
    } else {
      journal.finish("failed", outcome.reason);
      parkTicket(ticket.number, outcome.reason, outcome.pullRequestUrl);
    }
    return { ticket, outcome };
  },
});

syncRepoToMain();
for (const parent of parentsWithEveryChildClosed()) {
  closeCompletedParent(parent.number);
  say(`  closed parent #${parent.number} — every sub-issue done`);
}

const shipped = results.filter(({ outcome }) => outcome.status === "shipped");
const parked = results.filter(({ outcome }) => outcome.status !== "shipped");

say(`\n${"=".repeat(60)}`);
say(
  `Shipped ${shipped.length}, parked ${parked.length}, ${asDuration(Math.max(0, endOfBudget - Date.now()))} of budget unused.`,
);
for (const { ticket, outcome } of shipped)
  if (outcome.status === "shipped")
    say(`  ✓ #${ticket.number} ${outcome.pullRequestUrl}`);
for (const { ticket, outcome } of parked)
  if (outcome.status === "blocked") say(`  ⚑ #${ticket.number} — ${outcome.reason}`);
