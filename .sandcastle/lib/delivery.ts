import { randomUUID } from "node:crypto";

import type { Ticket } from "./github.js";
import type { ShipHistory } from "./ship-history.js";

export interface DeliveryEnvironment<T> {
  readonly assign: (ticket: Ticket) => void;
  readonly reset: (branch: string) => void;
  readonly open: (branch: string, resumed: boolean) => Promise<T>;
  readonly sessionExists: (path: string) => boolean;
  /** Whether a branch holds commits past main. */
  readonly carriesWork: (branch: string) => boolean;
}

export async function prepareDelivery<T>(
  ticket: Ticket,
  history: ShipHistory,
  environment: DeliveryEnvironment<T>,
): Promise<{
  branch: string;
  resumed: boolean;
  sandbox: T;
  sessionId?: string;
}> {
  const previous = history
    .pending()
    .find((delivery) => delivery.ticket.number === ticket.number);
  if (previous?.pullRequest)
    throw new Error(
      `PR #${previous.pullRequest.number} already owns #${ticket.number}`,
    );
  const parked = previous ? undefined : history.parkedBranch(ticket.number);
  const continued =
    parked && environment.carriesWork(parked) ? parked : undefined;
  const branch =
    previous?.branch ??
    continued ??
    `feat/${ticket.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48)}-${randomUUID().slice(0, 8)}-${ticket.number}`;
  const resumed = previous !== undefined || continued !== undefined;
  if (!previous) history.record({ type: "delivery.started", ticket, branch });
  if (!resumed) environment.reset(branch);
  environment.assign(ticket);
  const sandbox = await environment.open(branch, resumed);
  const session = history.ownerSession(ticket.number);
  return {
    branch,
    resumed,
    sandbox,
    sessionId:
      session && environment.sessionExists(session.path)
        ? session.id
        : undefined,
  };
}
