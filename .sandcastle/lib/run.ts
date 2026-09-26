import type { MergeOutcome, QueuedPullRequest, Ticket } from "./github.js";
import type { Finding, ShipOutcome } from "./ticket.js";
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
  readonly fileFollowUp: (
    ticket: Ticket,
    pullRequestUrl: string,
    finding: Finding,
  ) => void;
  readonly ticketClosed: (ticket: Ticket) => boolean;
  readonly say: (line: string) => void;
}

export interface ShipLoopOptions {
  readonly lanes: number;
  readonly withinBudget: () => boolean;
}

interface Queued {
  readonly ticket: Ticket;
  readonly pullRequest: QueuedPullRequest;
  readonly advisory: readonly Finding[];
}

export interface ShipReport {
  readonly merged: readonly {
    ticket: Ticket;
    pullRequest: QueuedPullRequest;
  }[];
  readonly parked: readonly { ticket: Ticket; reason: string }[];
  readonly outage?: string;
}

const asReason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const runShipLoop = async (
  ports: ShipPorts,
  { lanes, withinBudget }: ShipLoopOptions,
): Promise<ShipReport> => {
  const parked: { ticket: Ticket; reason: string }[] = [];
  let outage: string | undefined;

  const settled = await drainAcrossLanes<Ticket, Queued | undefined>({
    lanes,
    nextItem: ports.nextTicket,
    stopDispatchingWhen: () => outage !== undefined || !withinBudget(),
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
        return undefined;
      }

      if (outcome.status === "blocked") {
        ports.park(ticket, outcome.reason, outcome.pullRequestUrl);
        parked.push({ ticket, reason: outcome.reason });
        ports.say(`  #${ticket.number} parked: ${outcome.reason}`);
        return undefined;
      }

      ports.say(`  #${ticket.number} queued ${outcome.pullRequest.url}`);
      return {
        ticket,
        pullRequest: outcome.pullRequest,
        advisory: outcome.advisory,
      };
    },
  });

  const queued = settled.flatMap((entry) => entry ?? []);
  ports.say(`\n--- confirming ${queued.length} queued pull request(s) ---`);

  const confirmations = await Promise.allSettled(
    queued.map(async ({ pullRequest }) => ports.confirm(pullRequest)),
  );

  const merged: { ticket: Ticket; pullRequest: QueuedPullRequest }[] = [];
  queued.forEach(({ ticket, pullRequest, advisory }, index) => {
    const settledConfirmation = confirmations[index];
    if (!settledConfirmation) return;

    if (settledConfirmation.status === "rejected") {
      const reason = `the run could not confirm ${pullRequest.url}: ${asReason(settledConfirmation.reason)}`;
      ports.park(ticket, reason, pullRequest.url);
      parked.push({ ticket, reason });
      return;
    }

    const outcome = settledConfirmation.value;
    if (outcome.status !== "merged") {
      ports.park(ticket, outcome.reason, pullRequest.url);
      parked.push({ ticket, reason: outcome.reason });
      return;
    }

    if (!ports.ticketClosed(ticket)) {
      ports.say(
        `  warning: #${ticket.number} did not close — check the PR body's Fixes reference`,
      );
    }
    for (const finding of advisory)
      ports.fileFollowUp(ticket, pullRequest.url, finding);
    merged.push({ ticket, pullRequest });
  });

  return { merged, parked, outage };
};
