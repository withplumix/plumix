import { setTimeout as sleep } from "node:timers/promises";

import type { Ticket } from "./lib/github.js";
import { adrNumbersIn, nextFreeAdr } from "./lib/adr.js";
import { decideWhatTheDocsSettle } from "./lib/decide.js";
import {
  aReadyTicketWaitsOnAMovingBlocker,
  closeCompletedParent,
  commentOnPullRequest,
  firstUnblockedUnassignedTicket,
  hasMerged,
  isTicketClosed,
  listReadyTickets,
  loopPullRequestsInFlight,
  parentsWithEveryChildClosed,
  parkTicket,
  pullRequestForBranch,
  queueForMerge,
  releaseClaim,
  rerunFailedJobs,
  runStatus,
  syncRepoToMain,
  textsThatClaimAdrNumbers,
  ticketByNumber,
  waitForMerge,
  whyTheCheckoutIsBroken,
} from "./lib/github.js";
import { staleClaims } from "./lib/in-flight.js";
import { say } from "./lib/log.js";
import { sandboxImageOrRefuse } from "./lib/preflight.js";
import { recoverDeliveries } from "./lib/recovery.js";
import {
  aRerunCannotTurnItGreen,
  aRerunCouldTurnThemGreen,
  failedStepsOf,
  idsInJobUrl,
  repairPullRequest,
} from "./lib/repair.js";
import { REPO_ROOT } from "./lib/repo.js";
import { rerunOnceTheRunsFinish } from "./lib/run-completion.js";
import {
  LOOK_AGAIN_FOR_AN_UNBLOCKED_TICKET_EVERY_MS,
  runShipLoop,
} from "./lib/run.js";
import { pinLaneCount, pinSandboxImage } from "./lib/sandbox.js";
import { ShipHistory } from "./lib/ship-history.js";
import { acquireShipLock } from "./lib/ship-lock.js";
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
const releaseShipLock = acquireShipLock(import.meta.dirname);
process.once("exit", releaseShipLock);
const history = new ShipHistory(import.meta.dirname);
say(`Ship journal: ${history.path}`);
for (const path of history.incompleteFiles) {
  say(`Incomplete final journal record ignored: ${path}`);
}
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

if (!onlyTickets.length)
  say(
    `Idle lanes look again every ${asDuration(LOOK_AGAIN_FOR_AN_UNBLOCKED_TICKET_EVERY_MS)} while a blocker has an open pull request`,
  );

const sandboxImage = sandboxImageOrRefuse(REPO_ROOT, say);
if (!sandboxImage) process.exit(1);
pinSandboxImage(sandboxImage);
pinLaneCount(laneCount);

syncRepoToMain();

const selected = (number: number) =>
  !onlyTickets.length || onlyTickets.includes(number);
const recovered = recoverDeliveries(
  history.pending().filter(({ ticket }) => selected(ticket.number)),
  loopPullRequestsInFlight().filter(({ ticket }) => selected(ticket.number)),
  pullRequestForBranch,
);
for (const { ticket, branch } of recovered.interrupted) {
  claimed.add(ticket.number);
  say(
    `#${ticket.number} has interrupted work on ${branch}; preserved for manual recovery`,
  );
}
for (const queued of recovered.inFlight) {
  claimed.add(queued.ticket.number);
  history.record({ type: "pr.tracked", ...queued });
}
const namedTickets = onlyTickets.filter((number) => !claimed.has(number));

function journalFor(ticket: Ticket): Journal {
  const journal = new Journal(import.meta.dirname, (phase) => {
    history.record({
      type: "phase.finished",
      issue: ticket.number,
      journalRunId: journal.runId,
      phase,
    });
  });
  return journal;
}

if (!onlyTickets.length) {
  const claimedEarlier = listReadyTickets()
    .filter(({ assignees }) => assignees.length > 0)
    .map(({ number }) => number);
  for (const ticketNumber of staleClaims(claimedEarlier, [
    ...recovered.inFlight,
    ...recovered.interrupted.map(({ ticket }) => ({ ticket })),
  ])) {
    releaseClaim(ticketNumber);
    say(
      `#${ticketNumber} was claimed by a run that stopped mid-ticket; released`,
    );
  }
}

const report = await runShipLoop(
  {
    history,
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
      const journal = journalFor(ticket);
      const nextAdr = nextFreeAdr(
        textsThatClaimAdrNumbers().flatMap(adrNumbersIn),
        adrsHeldThisRun,
      );
      return shipTicket(ticket, journal, nextAdr, history).then(
        (outcome) => {
          if (outcome.status === "queued") journal.finish("shipped");
          else journal.finish("failed", outcome.reason);
          return outcome;
        },
        (error: unknown) => {
          journal.finish("failed", String(error));
          throw error;
        },
      );
    },
    decide: (ticket, reason) => {
      const journal = journalFor(ticket);
      return decideWhatTheDocsSettle(ticket, reason, journal).then(
        (settled) => {
          journal.finish(settled ? "shipped" : "failed", reason);
          return settled;
        },
        (error: unknown) => {
          journal.finish("failed", String(error));
          throw error;
        },
      );
    },
    retake: ({ number }) => {
      claimed.delete(number);
      if (onlyTickets.length) namedTickets.unshift(number);
    },
    park: ({ number }, reason, pullRequestUrl, briefFails) =>
      parkTicket(number, reason, pullRequestUrl, briefFails),
    releaseClaim: ({ number }) => releaseClaim(number),
    repair: (ticket, pullRequest, refusal) => {
      const journal = journalFor(ticket);
      return repairPullRequest(ticket, pullRequest, refusal, journal).then(
        (outcome) => {
          if (outcome.status === "repaired") journal.finish("shipped");
          else journal.finish("failed", outcome.reason);
          return outcome;
        },
        (error: unknown) => {
          journal.finish("failed", String(error));
          throw error;
        },
      );
    },
    rerunFailedChecks: async (_pullRequest, refusal) => {
      if (refusal.status !== "failed") return false;
      if (!aRerunCouldTurnThemGreen(refusal.failingChecks)) return false;
      const jobs = refusal.failingChecks.flatMap(
        ({ url }) => idsInJobUrl(url) ?? [],
      );
      if (
        aRerunCannotTurnItGreen(jobs.map(({ jobId }) => failedStepsOf(jobId)))
      )
        return false;
      return rerunOnceTheRunsFinish(
        [...new Set(jobs.map(({ runId }) => runId))],
        {
          statusOf: runStatus,
          rerun: rerunFailedJobs,
          pause: () => new Promise((resolve) => setTimeout(resolve, 30_000)),
          attempts: 60,
        },
      );
    },
    hasMerged: ({ number }) => hasMerged(number),
    noteOnPullRequest: ({ number }, note) => {
      try {
        commentOnPullRequest(number, note);
      } catch (error) {
        say(`  #${number} note: ${String(error).split("\n")[0]}`);
      }
    },
    inFlightFromEarlierRuns: () => recovered.inFlight,
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
    brokenCheckout: () => whyTheCheckoutIsBroken(),
    aBlockerIsMoving: () =>
      !onlyTickets.length && aReadyTicketWaitsOnAMovingBlocker(claimed),
    pause: (ms, signal) =>
      sleep(ms, undefined, { signal }).catch(() => undefined),
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
history.record({ type: "ship.finished" });
