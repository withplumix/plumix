import type { MergeOutcome, QueuedPullRequest, Ticket } from "./github.js";
import type { ShipOutcome } from "./ticket.js";
import { drainAcrossLanes } from "./lanes.js";
import { looksLikeTheRunBeingOver } from "./outage.js";

export interface ShipPorts {
  readonly nextTicket: () => Ticket | undefined;
  readonly ship: (ticket: Ticket) => Promise<ShipOutcome>;
  readonly park: (
    ticket: Ticket,
    reason: string,
    pullRequestUrl?: string,
  ) => void;
  readonly releaseClaim: (ticket: Ticket) => void;
  readonly confirm: (pullRequest: QueuedPullRequest) => Promise<MergeOutcome>;
  readonly repair: (
    ticket: Ticket,
    pullRequest: QueuedPullRequest,
    refusal: MergeOutcome,
  ) => Promise<RepairOutcome>;
  readonly rerunFailedChecks: (
    pullRequest: QueuedPullRequest,
    refusal: MergeOutcome,
  ) => Promise<boolean>;
  readonly requeue: (pullRequest: QueuedPullRequest) => void;
  readonly ticketClosed: (ticket: Ticket) => boolean;
  readonly say: (line: string) => void;
}

export interface ShipLoopOptions {
  readonly lanes: number;
  readonly withinBudget: () => boolean;
}

export type RepairOutcome =
  | { readonly status: "repaired" }
  | { readonly status: "declined"; readonly reason: string };

export const REPAIRS_A_PULL_REQUEST_GETS = 2;

const failedOnItsOwnChecks = (refusal: MergeOutcome): boolean =>
  refusal.status === "failed" &&
  refusal.failingChecks.length > 0 &&
  !refusal.fromTheMergeGroup &&
  !refusal.conflicted;

interface Queued {
  readonly ticket: Ticket;
  readonly pullRequest: QueuedPullRequest;
}

export interface ShipReport {
  readonly merged: readonly {
    ticket: Ticket;
    pullRequest: QueuedPullRequest;
  }[];
  readonly parked: readonly { ticket: Ticket; reason: string }[];
  readonly outage?: string;
  readonly stoppedBecause?: string;
}

const FAILURES_IN_A_ROW_THAT_MEAN_THE_RUN_AND_NOT_THE_TICKETS = 3;

const asReason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const runShipLoop = async (
  ports: ShipPorts,
  { lanes, withinBudget }: ShipLoopOptions,
): Promise<ShipReport> => {
  const parked: { ticket: Ticket; reason: string }[] = [];
  let outage: string | undefined;
  let failuresInARow = 0;
  let stoppedBecause: string | undefined;

  const noteFailure = (reason: string): void => {
    failuresInARow += 1;
    if (
      failuresInARow < FAILURES_IN_A_ROW_THAT_MEAN_THE_RUN_AND_NOT_THE_TICKETS
    )
      return;
    stoppedBecause = `${failuresInARow} tickets failed in a row, the last saying: ${reason}`;
    ports.say(`\n${stoppedBecause}\nLeaving the rest of the queue untouched.`);
  };

  const confirmRepairingWhatIsRefused = async ({
    ticket,
    pullRequest,
  }: Queued): Promise<MergeOutcome> => {
    let outcome = await ports.confirm(pullRequest);
    if (
      outcome.status === "failed" &&
      failedOnItsOwnChecks(outcome) &&
      (await ports.rerunFailedChecks(pullRequest, outcome))
    ) {
      ports.say(
        `  #${pullRequest.number} refused (${outcome.reason}), re-running the failed jobs once`,
      );
      ports.requeue(pullRequest);
      outcome = await ports.confirm(pullRequest);
    }
    for (
      let repairs = 0;
      outcome.status !== "merged" &&
      !outcome.needsAPerson &&
      repairs < REPAIRS_A_PULL_REQUEST_GETS;
      repairs += 1
    ) {
      ports.say(
        `  #${pullRequest.number} refused (${outcome.reason}), repairing (${repairs + 1}/${REPAIRS_A_PULL_REQUEST_GETS})`,
      );
      const repaired = await ports.repair(ticket, pullRequest, outcome);
      if (repaired.status === "declined") {
        return { status: "failed", reason: repaired.reason, failingChecks: [] };
      }
      ports.requeue(pullRequest);
      outcome = await ports.confirm(pullRequest);
    }
    return outcome;
  };

  const confirming: {
    readonly ticket: Ticket;
    readonly pullRequest: QueuedPullRequest;
    readonly outcome: Promise<PromiseSettledResult<MergeOutcome>>;
  }[] = [];

  const unsettled = new Set<Promise<unknown>>();
  const untilAConfirmationSettles = async (): Promise<boolean> => {
    if (unsettled.size === 0) return false;
    await Promise.race(unsettled);
    return true;
  };

  await drainAcrossLanes<Ticket, void>({
    lanes,
    nextItem: ports.nextTicket,
    waitForMoreWork: untilAConfirmationSettles,
    stopDispatchingWhen: () =>
      outage !== undefined || stoppedBecause !== undefined || !withinBudget(),
    inLane: async (ticket) => {
      let outcome: ShipOutcome;
      try {
        outcome = await ports.ship(ticket);
      } catch (error) {
        const reason = asReason(error);
        ports.releaseClaim(ticket);
        if (looksLikeTheRunBeingOver(reason)) outage ??= reason;
        ports.say(
          `  #${ticket.number} left as it was — the harness threw: ${reason}`,
        );
        noteFailure(reason);
        return;
      }

      if (outcome.status === "blocked") {
        ports.park(ticket, outcome.reason, outcome.pullRequestUrl);
        parked.push({ ticket, reason: outcome.reason });
        ports.say(`  #${ticket.number} parked: ${outcome.reason}`);
        noteFailure(outcome.reason);
        return;
      }

      failuresInARow = 0;

      const { pullRequest } = outcome;
      ports.say(`  #${ticket.number} queued ${pullRequest.url}`);
      const confirmation = confirmRepairingWhatIsRefused({
        ticket,
        pullRequest,
      }).then(
        (value): PromiseSettledResult<MergeOutcome> => ({
          status: "fulfilled",
          value,
        }),
        (reason: unknown): PromiseSettledResult<MergeOutcome> => ({
          status: "rejected",
          reason,
        }),
      );
      unsettled.add(confirmation);
      void confirmation.then(() => unsettled.delete(confirmation));
      confirming.push({ ticket, pullRequest, outcome: confirmation });
    },
  });

  ports.say(`\n--- waiting on ${confirming.length} queued pull request(s) ---`);

  const merged: { ticket: Ticket; pullRequest: QueuedPullRequest }[] = [];
  for (const { ticket, pullRequest, outcome } of confirming) {
    const settledConfirmation = await outcome;

    if (settledConfirmation.status === "rejected") {
      const reason = `the run could not confirm ${pullRequest.url}: ${asReason(settledConfirmation.reason)}`;
      ports.park(ticket, reason, pullRequest.url);
      parked.push({ ticket, reason });
      continue;
    }

    const confirmed = settledConfirmation.value;
    if (confirmed.status !== "merged") {
      ports.park(ticket, confirmed.reason, pullRequest.url);
      parked.push({ ticket, reason: confirmed.reason });
      continue;
    }

    if (!ports.ticketClosed(ticket)) {
      ports.say(
        `  warning: #${ticket.number} did not close — check the PR body's Fixes reference`,
      );
    }
    merged.push({ ticket, pullRequest });
  }

  return { merged, parked, outage, stoppedBecause };
};
