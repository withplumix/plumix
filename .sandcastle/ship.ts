import {
  closeCompletedParent,
  parentsWithEveryChildClosed,
  parkTicket,
  syncRepoToMain,
  ticketByNumber,
  unblockedUnassignedTickets,
} from "./lib/github.js";
import { say } from "./lib/log.js";
import { Journal } from "./lib/telemetry.js";
import { shipTicket } from "./lib/ticket.js";

const DEFAULT_BUDGET_HOURS = 8;
const MINIMUM_TIME_TO_START_ANOTHER_TICKET_MS = 75 * 60_000;

interface ShipOptions {
  readonly onlyTicket?: number;
  readonly budgetMs: number;
}

const readOptions = (argv: readonly string[]): ShipOptions => {
  const onlyTicket = argv.find((arg) => /^\d+$/.test(arg));
  const hours = argv
    .find((arg) => /^--hours=\d+(\.\d+)?$/.test(arg))
    ?.split("=")
    .at(1);
  return {
    onlyTicket: onlyTicket ? Number(onlyTicket) : undefined,
    budgetMs: Number(hours ?? DEFAULT_BUDGET_HOURS) * 3_600_000,
  };
};

const asDuration = (ms: number): string => {
  const minutes = Math.round(ms / 60_000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`
    : `${minutes}m`;
};

const { onlyTicket, budgetMs } = readOptions(process.argv.slice(2));
const endOfBudget = Date.now() + budgetMs;
const shipped: string[] = [];
const parked: string[] = [];
const alreadyAttempted = new Set<number>();

say(
  `Ship run — budget ${asDuration(budgetMs)}, ends ${new Date(endOfBudget).toLocaleTimeString()}`,
);

syncRepoToMain();

while (true) {
  const remainingMs = endOfBudget - Date.now();
  if (remainingMs < MINIMUM_TIME_TO_START_ANOTHER_TICKET_MS) {
    say(
      `\nStopping: ${asDuration(remainingMs)} left, less than one ticket needs.`,
    );
    break;
  }

  const candidate = onlyTicket
    ? ticketByNumber(onlyTicket)
    : unblockedUnassignedTickets().find(
        ({ number }) => !alreadyAttempted.has(number),
      );
  if (!candidate) {
    say("\nStopping: no unblocked, unassigned ready-for-agent ticket left.");
    break;
  }

  alreadyAttempted.add(candidate.number);
  const journal = new Journal(import.meta.dirname);
  let outcome;
  try {
    outcome = await shipTicket(candidate, journal);
  } catch (error) {
    outcome = {
      status: "blocked" as const,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (outcome.status === "shipped") {
    journal.finish("shipped");
    shipped.push(`#${candidate.number} ${outcome.pullRequestUrl}`);
  } else {
    journal.finish("failed", outcome.reason);
    parkTicket(candidate.number, outcome.reason, outcome.pullRequestUrl);
    parked.push(`#${candidate.number} — ${outcome.reason}`);
  }

  syncRepoToMain();
  for (const parent of parentsWithEveryChildClosed()) {
    closeCompletedParent(parent.number);
    say(`  closed parent #${parent.number} — every sub-issue done`);
  }
  if (onlyTicket) break;
}

say(`\n${"=".repeat(60)}`);
say(
  `Shipped ${shipped.length}, parked ${parked.length}, ${asDuration(Math.max(0, endOfBudget - Date.now()))} of budget unused.`,
);
for (const line of shipped) say(`  ✓ ${line}`);
for (const line of parked) say(`  ⚑ ${line}`);
