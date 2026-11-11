import type { QueuedPullRequest } from "./github.js";
import type { Queued } from "./run.js";
import type { PendingDelivery } from "./ship-history.js";

export interface RecoveredDeliveries {
  readonly inFlight: readonly Queued[];
  readonly interrupted: readonly PendingDelivery[];
}

export function recoverDeliveries(
  pending: readonly PendingDelivery[],
  openPullRequests: readonly Queued[],
  findPullRequest: (branch: string) => QueuedPullRequest | undefined,
): RecoveredDeliveries {
  const inFlight: Queued[] = [];
  const interrupted: PendingDelivery[] = [];
  for (const delivery of pending) {
    const { ticket, pullRequest, branch } = delivery;
    const found =
      pullRequest ??
      openPullRequests.find((queued) => queued.ticket.number === ticket.number)
        ?.pullRequest ??
      (branch ? findPullRequest(branch) : undefined);
    if (found) inFlight.push({ ticket, pullRequest: found });
    else interrupted.push(delivery);
  }
  for (const queued of openPullRequests) {
    if (
      !inFlight.some(({ ticket }) => ticket.number === queued.ticket.number)
    ) {
      inFlight.push(queued);
    }
  }
  return { inFlight, interrupted };
}
