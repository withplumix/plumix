import type { Queued } from "./run.js";
import { READY_LABEL } from "./repo.js";

interface OpenPullRequest {
  readonly number: number;
  readonly url: string;
  readonly headRefName: string;
}

interface IssueState {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly labels: readonly string[];
}

const LOOP_BRANCH = /^feat\/.+-(\d+)$/;

export const ticketOfLoopBranch = (branch: string): number | undefined => {
  const digits = LOOP_BRANCH.exec(branch)?.[1];
  return digits ? Number(digits) : undefined;
};

export const stillInTheLoopsHands = (
  pullRequests: readonly OpenPullRequest[],
  issues: readonly IssueState[],
): readonly Queued[] =>
  pullRequests.flatMap(({ number, url, headRefName }) => {
    const ticket = issues.find(
      (issue) => issue.number === ticketOfLoopBranch(headRefName),
    );
    const held =
      ticket?.state === "OPEN" && ticket.labels.includes(READY_LABEL);
    return held
      ? [
          {
            ticket: { number: ticket.number, title: ticket.title },
            pullRequest: { number, url },
          },
        ]
      : [];
  });

export const staleClaims = (
  claimed: readonly number[],
  inFlight: readonly Queued[],
): readonly number[] =>
  claimed.filter(
    (ticketNumber) =>
      !inFlight.some(({ ticket }) => ticket.number === ticketNumber),
  );
