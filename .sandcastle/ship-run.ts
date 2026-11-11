import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Ticket } from "./lib/github.js";
import type { ShipOptions } from "./lib/ship-options.js";
import { accountGate } from "./lib/account.js";
import { adrNumbersIn, nextFreeAdr } from "./lib/adr.js";
import { createShipControl } from "./lib/control.js";
import { decideWhatTheDocsSettle } from "./lib/decide.js";
import {
  aReadyTicketWaitsOnAMovingBlocker,
  closeCompletedParent,
  commentOnPullRequest,
  firstUnblockedUnassignedTicket,
  hasMerged,
  inspectPullRequest,
  isTicketClosed,
  listReadyTickets,
  loopPullRequestsInFlight,
  mergeGroupFailures,
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
import { supervisePullRequest } from "./lib/supervision.js";
import { Journal } from "./lib/telemetry.js";
import { shipTicket } from "./lib/ticket.js";

const MINIMUM_TIME_TO_START_ANOTHER_TICKET_MS = 75 * 60_000;

const asDuration = (ms: number): string => {
  const minutes = Math.round(ms / 60_000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`
    : `${minutes}m`;
};

export async function runShip({
  onlyTickets,
  lanes,
  budgetMs,
}: ShipOptions): Promise<void> {
  const releaseShipLock = acquireShipLock(import.meta.dirname);
  process.once("exit", releaseShipLock);
  const history = new ShipHistory(import.meta.dirname);
  const endOfBudget = Date.now() + budgetMs;
  const control = createShipControl(import.meta.dirname, endOfBudget);
  process.once("SIGINT", control.stop);
  process.once("SIGTERM", control.stop);
  try {
    const account = accountGate(history, {
      now: Date.now,
      pause: control.pause,
      checkpoint: control.checkpoint,
    });
    say(`Ship journal: ${history.path}`);
    for (const path of history.incompleteFiles) {
      say(`Incomplete final journal record ignored: ${path}`);
    }
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
    const promptDir = join(import.meta.dirname, "prompts");
    const promptHash = createHash("sha256");
    for (const file of readdirSync(promptDir)
      .filter((file) => file.endsWith(".md"))
      .sort())
      promptHash.update(file).update(readFileSync(join(promptDir, file)));
    history.record({
      type: "ship.configured",
      revision: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }).trim(),
      promptHash: promptHash.digest("hex"),
      lanes: laneCount,
      image: sandboxImage,
      node: process.version,
    });

    syncRepoToMain();

    const selected = (number: number) =>
      !onlyTickets.length || onlyTickets.includes(number);
    const recovered = recoverDeliveries(
      history.pending().filter(({ ticket }) => selected(ticket.number)),
      loopPullRequestsInFlight().filter(({ ticket }) =>
        selected(ticket.number),
      ),
      pullRequestForBranch,
    );
    for (const { ticket, branch } of recovered.interrupted) {
      claimed.add(ticket.number);
      say(`#${ticket.number} will resume interrupted work on ${branch}`);
    }
    for (const queued of recovered.inFlight) {
      claimed.add(queued.ticket.number);
      history.record({ type: "pr.tracked", ...queued });
    }
    const namedTickets = onlyTickets.filter((number) => !claimed.has(number));
    const interruptedTickets = recovered.interrupted.map(
      ({ ticket }) => ticket,
    );

    function journalFor(ticket: Ticket): Journal {
      const journal = new Journal(
        import.meta.dirname,
        (phase) => {
          history.record({
            type: "phase.finished",
            issue: ticket.number,
            journalRunId: journal.runId,
            phase,
          });
        },
        account,
        history.usageCursors,
      );
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
          const interrupted = interruptedTickets.shift();
          if (interrupted) return interrupted;
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
          control.checkpoint();
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
          control.checkpoint();
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
          control.checkpoint();
          const journal = journalFor(ticket);
          return repairPullRequest(
            ticket,
            pullRequest,
            refusal,
            journal,
            history,
          ).then(
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
            aRerunCannotTurnItGreen(
              jobs.map(({ jobId }) => failedStepsOf(jobId)),
            )
          )
            return false;
          return rerunOnceTheRunsFinish(
            [...new Set(jobs.map(({ runId }) => runId))],
            {
              statusOf: runStatus,
              rerun: rerunFailedJobs,
              pause: () => control.pause(30_000),
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
        confirm: (pullRequest) => {
          const delivery = history
            .pending()
            .find((item) => item.pullRequest?.number === pullRequest.number);
          if (!delivery)
            throw new Error(`No delivery for PR #${pullRequest.number}`);
          return supervisePullRequest(
            { ticket: delivery.ticket, pullRequest },
            history,
            {
              inspect: () => inspectPullRequest(pullRequest.number),
              now: Date.now,
              pause: control.pause,
              requeue: () => queueForMerge(pullRequest.number),
              queueFailures: () => mergeGroupFailures(pullRequest.number),
              say,
            },
          );
        },
        ticketClosed: ({ number }) => isTicketClosed(number),
        brokenCheckout: () => whyTheCheckoutIsBroken(),
        aBlockerIsMoving: () =>
          !onlyTickets.length && aReadyTicketWaitsOnAMovingBlocker(claimed),
        pause: (ms, signal) => control.pause(ms, signal).catch(() => undefined),
        say,
      },
      {
        lanes: laneCount,
        withinBudget: () =>
          !control.stopped() &&
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
  } finally {
    control.close();
    process.removeListener("SIGINT", control.stop);
    process.removeListener("SIGTERM", control.stop);
    process.removeListener("exit", releaseShipLock);
    releaseShipLock();
  }
}
