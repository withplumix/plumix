const NOTHING_THE_TICKET_DID =
  /usage limit|rate.?limit|\b429\b|\b401\b|\b529\b|credit balance|quota|authentication|unauthor|invalid x-api-key|oauth|overloaded/i;

export const looksLikeAnOutage = (reason: string): boolean =>
  NOTHING_THE_TICKET_DID.test(reason);

const THE_HARNESS_NOT_THE_BRANCH =
  /not a git repository|already checked out|worktree|docker daemon|unable to delete container|no such container|exit 128/i;

export const looksLikeTheHarnessFailing = (reason: string): boolean =>
  THE_HARNESS_NOT_THE_BRANCH.test(reason);
