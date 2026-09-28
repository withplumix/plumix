import { adrNumbersIn, nextFreeAdr } from "./lib/adr.js";
import {
  closeCompletedParent,
  firstUnblockedUnassignedTicket,
  isTicketClosed,
  parentsWithEveryChildClosed,
  parkTicket,
  queueForMerge,
  releaseClaim,
  rerunFailedJobs,
  syncRepoToMain,
  textsThatClaimAdrNumbers,
  ticketByNumber,
  waitForMerge,
} from "./lib/github.js";
import { say } from "./lib/log.js";
import { refuseToStartOnABrokenMachine } from "./lib/preflight.js";
import { idsInJobUrl, repairPullRequest } from "./lib/repair.js";
import { REPO_ROOT } from "./lib/repo.js";
import { runShipLoop } from "./lib/run.js";
import { Journal } from "./lib/telemetry.js";
import { shipTicket } from "./lib/ticket.js";

const DEFAULT_BUDGET_HOURS = 8;
const DEFAULT_LANES = 3;
const MERGE_POLL_INTERVAL_MS = 120_000;
const MERGE_GIVE_UP_AFTER_MS = 2_700_000;
const MINIMUM_TIME_TO_START_ANOTHER_TICKET_MS = 75 * 60_000;

interface ShipOptions {
  readonly onlyTickets: readonly number[];
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
  return {
    onlyTickets: argv.filter((arg) => /^\d+$/.test(arg)).map(Number),
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

const { onlyTickets, lanes, budgetMs } = readOptions(process.argv.slice(2));
const namedTickets = [...onlyTickets];
const endOfBudget = Date.now() + budgetMs;
const claimed = new Set<number>();
const adrsHeldThisRun = new Set<number>();
const laneCount = Math.max(
  1,
  onlyTickets.length ? Math.min(lanes, onlyTickets.length) : lanes,
);

say(
  `Ship run — budget ${asDuration(budgetMs)}, ${laneCount} lane(s), ends ${new Date(endOfBudget).toLocaleTimeString()}`,
);

if (refuseToStartOnABrokenMachine(REPO_ROOT, say)) process.exit(1);

syncRepoToMain();

const report = await runShipLoop(
  {
    nextTicket: () => {
      const named = namedTickets.shift();
      const candidate =
        named !== undefined
          ? ticketByNumber(named)
          : onlyTickets.length
            ? undefined
            : firstUnblockedUnassignedTicket(claimed);
      if (!candidate || claimed.has(candidate.number)) return undefined;
      claimed.add(candidate.number);
      return candidate;
    },
    ship: (ticket) => {
      const journal = new Journal(import.meta.dirname);
      const nextAdr = nextFreeAdr(
        textsThatClaimAdrNumbers().flatMap(adrNumbersIn),
        adrsHeldThisRun,
      );
      return shipTicket(ticket, journal, nextAdr).then(
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
    repair: (ticket, pullRequest, refusal) => {
      const journal = new Journal(import.meta.dirname);
      return repairPullRequest(ticket, pullRequest, refusal, journal).then(
        (outcome) => {
          journal.finish(outcome.status === "repaired" ? "shipped" : "failed");
          return outcome;
        },
        (error: unknown) => {
          journal.finish("failed", String(error));
          throw error;
        },
      );
    },
    rerunFailedChecks: async (_pullRequest, refusal) =>
      refusal.status === "failed" &&
      rerunFailedJobs([
        ...new Set(
          refusal.failingChecks.flatMap(
            ({ url }) => idsInJobUrl(url)?.runId ?? [],
          ),
        ),
      ]),
    requeue: ({ number }) => {
      try {
        queueForMerge(number);
      } catch (error) {
        say(`  #${number} requeue: ${String(error).split("\n")[0]}`);
      }
    },
    confirm: (pullRequest) =>
      waitForMerge(pullRequest.number, {
        pollEveryMs: MERGE_POLL_INTERVAL_MS,
        giveUpAfterMs: MERGE_GIVE_UP_AFTER_MS,
        onPoll: (status) => say(`  #${pullRequest.number} ${status}`),
      }),
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
