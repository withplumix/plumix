import { execFileSync } from "node:child_process";

import {
  READY_LABEL,
  REPO_ROOT,
  REPO_SLUG,
  TRIAGE_LABEL,
  WONTFIX_LABEL,
} from "./repo.js";

export interface Ticket {
  readonly number: number;
  readonly title: string;
}

interface ListedTicket extends Ticket {
  readonly assignees: readonly unknown[];
}

export interface QueuedPullRequest {
  readonly number: number;
  readonly url: string;
}

export type MergeOutcome =
  | { readonly status: "merged" }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly failingChecks: readonly string[];
    };

const gh = (args: readonly string[]): string =>
  execFileSync("gh", [...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

const ghJson = <T>(args: readonly string[]): T => JSON.parse(gh(args)) as T;

const git = (args: readonly string[], cwd = REPO_ROOT): string =>
  execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

export const listReadyTickets = (): readonly ListedTicket[] =>
  ghJson([
    "issue",
    "list",
    "-R",
    REPO_SLUG,
    "--state",
    "open",
    "--label",
    READY_LABEL,
    "--limit",
    "100",
    "--json",
    "number,title,assignees",
  ]);

export const countOpenBlockers = (ticketNumber: number): number =>
  ghJson([
    "api",
    `repos/${REPO_SLUG}/issues/${ticketNumber}/dependencies/blocked_by`,
    "--jq",
    '[.[] | select(.state == "open")] | length',
  ]);

interface SubIssueCounts {
  readonly total: number;
  readonly open: number;
}

export const subIssueCounts = (ticketNumber: number): SubIssueCounts =>
  ghJson([
    "api",
    `repos/${REPO_SLUG}/issues/${ticketNumber}/sub_issues`,
    "--jq",
    '{total: length, open: [.[] | select(.state == "open")] | length}',
  ]);

export const isParentIssue = (ticketNumber: number): boolean =>
  subIssueCounts(ticketNumber).total > 0;

export const parentsWithEveryChildClosed = (): readonly Ticket[] =>
  listReadyTickets()
    .map(({ number, title }) => ({
      ticket: { number, title },
      counts: subIssueCounts(number),
    }))
    .filter(({ counts }) => counts.total > 0 && counts.open === 0)
    .map(({ ticket }) => ticket);

export const closeCompletedParent = (ticketNumber: number): void => {
  const children = ghJson<readonly { number: number }[]>([
    "api",
    `repos/${REPO_SLUG}/issues/${ticketNumber}/sub_issues`,
    "--jq",
    "map({number})",
  ]);
  const list = children.map(({ number }) => `- #${number}`).join("\n");
  gh([
    "issue",
    "close",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--comment",
    `Every sub-issue is closed:\n\n${list}`,
  ]);
};

export const unblockedUnassignedTickets = (): readonly Ticket[] =>
  listReadyTickets()
    .filter(({ assignees }) => assignees.length === 0)
    .sort((a, b) => a.number - b.number)
    .filter(
      ({ number }) => countOpenBlockers(number) === 0 && !isParentIssue(number),
    )
    .map(({ number, title }) => ({ number, title }));

export const ticketByNumber = (wanted: number): Ticket | undefined => {
  const { number, title, state } = ghJson<{
    number: number;
    title: string;
    state: string;
  }>([
    "issue",
    "view",
    String(wanted),
    "-R",
    REPO_SLUG,
    "--json",
    "number,title,state",
  ]);
  return state === "OPEN" ? { number, title } : undefined;
};

export const assignToSelf = (ticketNumber: number): void => {
  gh([
    "issue",
    "edit",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--add-assignee",
    "@me",
  ]);
};

const openTicketsWaitingOn = (ticketNumber: number): readonly number[] =>
  ghJson([
    "api",
    `repos/${REPO_SLUG}/issues/${ticketNumber}/dependencies/blocking`,
    "--jq",
    '[.[] | select(.state == "open") | .number]',
  ]);

const releaseTicketsWaitingOn = (ticketNumber: number): void => {
  const parkedId = issueDatabaseId(ticketNumber);
  for (const waiting of openTicketsWaitingOn(ticketNumber)) {
    gh([
      "api",
      "--method",
      "DELETE",
      `repos/${REPO_SLUG}/issues/${waiting}/dependencies/blocked_by/${parkedId}`,
    ]);
  }
};

export const parkTicket = (
  ticketNumber: number,
  reason: string,
  pullRequestUrl?: string,
): void => {
  releaseTicketsWaitingOn(ticketNumber);
  const openPullRequestNote = pullRequestUrl
    ? `\n\nThe branch is pushed and ${pullRequestUrl} is open, so the work is not lost.`
    : "";
  gh([
    "issue",
    "comment",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--body",
    `The unattended ship loop could not land this.\n\n\`\`\`\n${reason}\n\`\`\`${openPullRequestNote}\n\nUnassigned and relabelled for a human to look at.`,
  ]);
  gh([
    "issue",
    "edit",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--remove-label",
    READY_LABEL,
    "--add-label",
    "needs-triage",
    "--remove-assignee",
    "@me",
  ]);
};

export const isTicketClosed = (ticketNumber: number): boolean =>
  ghJson<{ state: string }>([
    "issue",
    "view",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--json",
    "state",
  ]).state === "CLOSED";

export const pushBranch = (branch: string, worktreePath: string): void => {
  git(["push", "--force-with-lease", "-u", "origin", branch], worktreePath);
};

export const openPullRequest = (
  branch: string,
  title: string,
  body: string,
): QueuedPullRequest => {
  const url =
    gh([
      "pr",
      "create",
      "-R",
      REPO_SLUG,
      "--base",
      "main",
      "--head",
      branch,
      "--title",
      title,
      "--body",
      body,
    ])
      .trim()
      .split("\n")
      .at(-1) ?? "";
  const number = Number(url.split("/").at(-1));
  return { number, url };
};

export const queueForMerge = (pullRequest: number): void => {
  gh([
    "pr",
    "merge",
    String(pullRequest),
    "-R",
    REPO_SLUG,
    "--squash",
    "--auto",
  ]);
};

interface PullRequestState {
  readonly state: string;
  readonly mergeStateStatus: string;
  readonly statusCheckRollup: readonly {
    readonly name?: string;
    readonly conclusion?: string;
    readonly status?: string;
  }[];
}

const pullRequestState = (pullRequest: number): PullRequestState =>
  ghJson([
    "pr",
    "view",
    String(pullRequest),
    "-R",
    REPO_SLUG,
    "--json",
    "state,mergeStateStatus,statusCheckRollup",
  ]);

const failedCheckNames = ({
  statusCheckRollup,
}: PullRequestState): readonly string[] =>
  statusCheckRollup
    .filter(({ conclusion }) => conclusion === "FAILURE")
    .map(({ name }) => name ?? "unnamed");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForMerge = async (
  pullRequest: number,
  {
    pollEveryMs,
    giveUpAfterMs,
    onPoll,
  }: {
    pollEveryMs: number;
    giveUpAfterMs: number;
    onPoll?: (status: string) => void;
  },
): Promise<MergeOutcome> => {
  const deadline = Date.now() + giveUpAfterMs;

  while (Date.now() < deadline) {
    const state = pullRequestState(pullRequest);
    onPoll?.(`${state.state}/${state.mergeStateStatus}`);

    if (state.state === "MERGED") return { status: "merged" };
    if (state.state === "CLOSED") {
      return {
        status: "failed",
        reason: "pull request was closed without merging",
        failingChecks: [],
      };
    }

    const failures = failedCheckNames(state);
    if (failures.length > 0) {
      return {
        status: "failed",
        reason: `failing checks: ${failures.join(", ")}`,
        failingChecks: failures,
      };
    }
    await sleep(pollEveryMs);
  }

  return {
    status: "failed",
    reason: `still queued after ${Math.round(giveUpAfterMs / 60_000)} minutes`,
    failingChecks: [],
  };
};

export const rePushBranch = (branch: string, worktreePath: string): void => {
  git(["push", "--force-with-lease", "origin", `HEAD:${branch}`], worktreePath);
};

export const syncRepoToMain = (): void => {
  git(["fetch", "-p", "origin", "main"]);
};

export const resetBranchToMain = (branch: string): void => {
  git(["fetch", "-q", "origin", "main"]);
  git(["branch", "-f", branch, "origin/main"]);
};

export interface IssueComment {
  readonly body: string;
  readonly author: string;
}

export interface TriageCandidate {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly comments: readonly IssueComment[];
}

export const TRIAGE_DISCLAIMER = "> *This was generated by AI during triage.*";
export const TRIAGE_NOTES_HEADING = "## Triage Notes";

const triageComment = (body: string): string =>
  `${TRIAGE_DISCLAIMER}\n\n${body}`;

export const listTriageCandidates = (): readonly TriageCandidate[] =>
  ghJson<
    readonly {
      number: number;
      title: string;
      body: string | null;
      comments: readonly { body: string; author: { login: string } }[];
    }[]
  >([
    "issue",
    "list",
    "-R",
    REPO_SLUG,
    "--state",
    "open",
    "--label",
    TRIAGE_LABEL,
    "--limit",
    "200",
    "--json",
    "number,title,body,comments",
  ]).map(({ number, title, body, comments }) => ({
    number,
    title,
    body: body ?? "",
    comments: comments.map(({ body: commentBody, author }) => ({
      body: commentBody,
      author: author.login,
    })),
  }));

export const readyForAgentCount = (): number =>
  listReadyTickets().filter(({ assignees }) => assignees.length === 0).length;

export const promoteToReadyForAgent = (
  ticketNumber: number,
  brief: string,
): void => {
  gh([
    "issue",
    "comment",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--body",
    triageComment(brief),
  ]);
  gh([
    "issue",
    "edit",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--remove-label",
    TRIAGE_LABEL,
    "--add-label",
    READY_LABEL,
  ]);
};

export const askOnIssue = (
  ticketNumber: number,
  questions: readonly string[],
): void => {
  const list = questions.map((question) => `- ${question}`).join("\n");
  gh([
    "issue",
    "comment",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--body",
    triageComment(
      `${TRIAGE_NOTES_HEADING}\n\nTriage got as far as it can unattended. What is still open:\n\n${list}`,
    ),
  ]);
};

export const closeAlreadyResolved = (
  ticketNumber: number,
  evidence: string,
): void => {
  gh([
    "issue",
    "edit",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--remove-label",
    TRIAGE_LABEL,
    "--add-label",
    WONTFIX_LABEL,
  ]);
  gh([
    "issue",
    "close",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--comment",
    triageComment(
      `Closing: the behaviour this asks for is already how the code reads.\n\n${evidence}`,
    ),
  ]);
};

const issueDatabaseId = (ticketNumber: number): number =>
  ghJson<number>([
    "api",
    `repos/${REPO_SLUG}/issues/${ticketNumber}`,
    "--jq",
    ".id",
  ]);

export const blockIssueOn = (
  ticketNumber: number,
  blockerNumber: number,
): void => {
  gh([
    "api",
    "--method",
    "POST",
    `repos/${REPO_SLUG}/issues/${ticketNumber}/dependencies/blocked_by`,
    "-F",
    `issue_id=${issueDatabaseId(blockerNumber)}`,
  ]);
};
