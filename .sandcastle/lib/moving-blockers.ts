export interface Blocker {
  readonly state: string;
  readonly openPullRequests: number;
}

export interface BlockedTicket {
  readonly number: number;
  readonly assigned: boolean;
  readonly blockedBy: readonly Blocker[];
}

export const someTicketWaitsOnAMovingBlocker = (
  tickets: readonly BlockedTicket[],
  alreadyTaken: ReadonlySet<number>,
): boolean =>
  tickets.some(
    ({ number, assigned, blockedBy }) =>
      !assigned &&
      !alreadyTaken.has(number) &&
      blockedBy.some(
        ({ state, openPullRequests }) =>
          state === "OPEN" && openPullRequests > 0,
      ),
  );
