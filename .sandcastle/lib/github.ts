import { execFileSync } from "node:child_process";

import type { Queued } from "./run.js";
import type {
  FailingCheck,
  MergeOutcome,
  PullRequestSnapshot,
} from "./verdict.js";
import { stillInTheLoopsHands, ticketOfLoopBranch } from "./in-flight.js";
import {
  DECISION_LABEL,
  HUMAN_LABEL,
  READY_LABEL,
  REPO_ROOT,
  REPO_SLUG,
  TRIAGE_LABEL,
  WONTFIX_LABEL,
} from "./repo.js";
import { judgeQueuedPullRequest } from "./verdict.js";
import { leftoverSandboxWorktree } from "./worktrees.js";

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

export type { MergeOutcome } from "./verdict.js";

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

export const firstUnblockedUnassignedTicket = (
  alreadyTaken: ReadonlySet<number>,
): Ticket | undefined => {
  const waiting = listReadyTickets()
    .filter(
      ({ assignees, number }) =>
        assignees.length === 0 && !alreadyTaken.has(number),
    )
    .sort((a, b) => a.number - b.number);

  for (const { number, title } of waiting) {
    if (countOpenBlockers(number) === 0 && !isParentIssue(number))
      return { number, title };
  }
  return undefined;
};

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

export const releaseClaim = (ticketNumber: number): void => {
  gh([
    "issue",
    "edit",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--remove-assignee",
    "@me",
  ]);
};

export const parkTicket = (
  ticketNumber: number,
  reason: string,
  pullRequestUrl?: string,
): void => {
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
    `The unattended ship loop could not land this.\n\n\`\`\`\n${reason}\n\`\`\`${openPullRequestNote}\n\nThe brief still stands, so this is not back to triage — it is waiting on a person.`,
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
    HUMAN_LABEL,
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

const snapshotOf = (pullRequest: number): PullRequestSnapshot => {
  const viewed = ghJson<{
    state: string;
    mergeStateStatus: string;
    statusCheckRollup: PullRequestSnapshot["statusCheckRollup"];
    autoMergeRequest: unknown;
    headRefName: string;
  }>([
    "pr",
    "view",
    String(pullRequest),
    "-R",
    REPO_SLUG,
    "--json",
    "state,mergeStateStatus,statusCheckRollup,autoMergeRequest,headRefName",
  ]);
  const [owner, name] = REPO_SLUG.split("/");
  const held = ghJson<HeldBy>([
    "api",
    "graphql",
    "-f",
    `query=${HELD_BY_QUERY}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `number=${pullRequest}`,
    "--jq",
    ".data.repository.pullRequest",
  ]);
  return {
    state: viewed.state,
    mergeStateStatus: viewed.mergeStateStatus,
    statusCheckRollup: viewed.statusCheckRollup,
    isInMergeQueue: held.isInMergeQueue,
    autoMergeEnabled: viewed.autoMergeRequest !== null,
    openCodeScanningAlerts: openCodeScanningAlerts(pullRequest),
    unresolvedReviewThreads: held.reviewThreads.nodes.flatMap(
      ({ id, isResolved, path, line, comments }) => {
        const [first] = comments.nodes;
        if (isResolved || !first || first.author?.login === CODE_SCANNING_LOGIN)
          return [];
        return [
          {
            id,
            author: first.author?.login ?? "ghost",
            byABot: first.author?.__typename === "Bot",
            location: `${path}${line ? `:${line}` : ""}`,
            body: first.body,
            url: first.url,
          },
        ];
      },
    ),
    changesRequestedBy: held.latestReviews.nodes
      .filter(
        ({ state, author }) =>
          state === "CHANGES_REQUESTED" && author?.__typename !== "Bot",
      )
      .map(({ author }) => author?.login ?? "ghost"),
  };
};

const CODE_SCANNING_LOGIN = "github-advanced-security";

interface Author {
  readonly login: string;
  readonly __typename: string;
}

interface HeldBy {
  readonly isInMergeQueue: boolean;
  readonly reviewThreads: {
    readonly nodes: readonly {
      readonly id: string;
      readonly isResolved: boolean;
      readonly path: string;
      readonly line: number | null;
      readonly comments: {
        readonly nodes: readonly {
          readonly author: Author | null;
          readonly body: string;
          readonly url: string;
        }[];
      };
    }[];
  };
  readonly latestReviews: {
    readonly nodes: readonly {
      readonly state: string;
      readonly author: Author | null;
    }[];
  };
}

const HELD_BY_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      isInMergeQueue
      reviewThreads(first: 100) {
        nodes {
          id isResolved path line
          comments(first: 1) { nodes { author { login __typename } body url } }
        }
      }
      latestReviews(first: 50) { nodes { state author { login __typename } } }
    }
  }
}`;

export const resolveReviewThreads = (threadIds: readonly string[]): void => {
  for (const threadId of threadIds) {
    gh([
      "api",
      "graphql",
      "-f",
      "query=mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id } } }",
      "-F",
      `id=${threadId}`,
    ]);
  }
};

const openCodeScanningAlerts = (pullRequest: number): readonly string[] =>
  ghJson<readonly string[]>([
    "api",
    `repos/${REPO_SLUG}/code-scanning/alerts?ref=refs/pull/${pullRequest}/head&state=open&per_page=50`,
    "--jq",
    '[.[] | "\\(.rule.description) at \\(.most_recent_instance.location.path):\\(.most_recent_instance.location.start_line)"]',
  ]);

const checksTheQueueFailed = (pullRequest: number): readonly FailingCheck[] => {
  const runs = ghJson<
    readonly { databaseId: number; headBranch: string; conclusion: string }[]
  >([
    "run",
    "list",
    "-R",
    REPO_SLUG,
    "--event",
    "merge_group",
    "--limit",
    "50",
    "--json",
    "databaseId,headBranch,conclusion",
  ]);
  const refused = runs.find(
    ({ headBranch, conclusion }) =>
      headBranch.startsWith(`gh-readonly-queue/main/pr-${pullRequest}-`) &&
      conclusion === "failure",
  );
  if (!refused) return [];
  return ghJson<readonly FailingCheck[]>([
    "run",
    "view",
    String(refused.databaseId),
    "-R",
    REPO_SLUG,
    "--json",
    "jobs",
    "--jq",
    '[.jobs[] | select(.conclusion == "failure") | {name, url}]',
  ]);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SIGHTINGS_THAT_MEAN_THE_QUEUE_DROPPED_IT = 2;

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
  let outOfTheQueueSightings = 0;

  while (Date.now() < deadline) {
    const snapshot = snapshotOf(pullRequest);
    onPoll?.(`${snapshot.state}/${snapshot.mergeStateStatus}`);
    const verdict = judgeQueuedPullRequest(snapshot);

    if (verdict.status === "merged" || verdict.status === "failed")
      return verdict;
    if (verdict.status === "left-the-queue") {
      outOfTheQueueSightings += 1;
      if (outOfTheQueueSightings >= SIGHTINGS_THAT_MEAN_THE_QUEUE_DROPPED_IT) {
        const failingChecks = checksTheQueueFailed(pullRequest);
        return {
          status: "failed",
          reason: `the merge queue dropped it${
            failingChecks.length
              ? `, failing ${failingChecks.map(({ name }) => name).join(", ")} on the merge group`
              : ""
          }`,
          failingChecks,
          fromTheMergeGroup: true,
        };
      }
    } else {
      outOfTheQueueSightings = 0;
    }
    await sleep(pollEveryMs);
  }

  return {
    status: "failed",
    reason: `still queued after ${Math.round(giveUpAfterMs / 60_000)} minutes`,
    failingChecks: [],
  };
};

export const syncRepoToMain = (): void => {
  git(["fetch", "-p", "origin", "main"]);
};

export const clearLeftoverWorktree = (branch: string): void => {
  const leftover = leftoverSandboxWorktree(
    git(["worktree", "list", "--porcelain"]),
    REPO_ROOT,
    branch,
  );
  if (leftover) git(["worktree", "remove", "--force", leftover]);
};

export const resetBranchToMain = (branch: string): void => {
  git(["fetch", "-q", "origin", "main"]);
  clearLeftoverWorktree(branch);
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
    `${TRIAGE_LABEL},${DECISION_LABEL}`,
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
  gh([
    "issue",
    "edit",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--add-label",
    DECISION_LABEL,
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
    `${TRIAGE_LABEL},${DECISION_LABEL}`,
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

export const branchOfPullRequest = (pullRequest: number): string =>
  ghJson<{ headRefName: string }>([
    "pr",
    "view",
    String(pullRequest),
    "-R",
    REPO_SLUG,
    "--json",
    "headRefName",
  ]).headRefName;

export const textsThatClaimAdrNumbers = (): readonly string[] => {
  const onMain = git(["ls-tree", "--name-only", "origin/main", "docs/adr/"]);
  const inOpenPullRequests = ghJson<readonly string[]>([
    "pr",
    "list",
    "-R",
    REPO_SLUG,
    "--state",
    "open",
    "--limit",
    "100",
    "--json",
    "files",
    "--jq",
    "[.[].files[].path]",
  ]);
  const inOpenIssues = ghJson<readonly string[]>([
    "issue",
    "list",
    "-R",
    REPO_SLUG,
    "--state",
    "open",
    "--search",
    "ADR",
    "--limit",
    "200",
    "--json",
    "body,comments",
    "--jq",
    "[.[] | .body, .comments[].body]",
  ]);
  return [onMain, ...inOpenPullRequests, ...inOpenIssues];
};

export const rerunFailedJobs = (runIds: readonly string[]): boolean =>
  runIds.filter((runId) => {
    try {
      gh(["run", "rerun", runId, "-R", REPO_SLUG, "--failed"]);
      return true;
    } catch {
      return false;
    }
  }).length > 0;

export const loopPullRequestsInFlight = (): readonly Queued[] => {
  const pullRequests = ghJson<
    readonly { number: number; url: string; headRefName: string }[]
  >([
    "pr",
    "list",
    "-R",
    REPO_SLUG,
    "--state",
    "open",
    "--author",
    "@me",
    "--limit",
    "100",
    "--json",
    "number,url,headRefName",
  ]);
  const ticketNumbers = [
    ...new Set(
      pullRequests.flatMap(
        ({ headRefName }) => ticketOfLoopBranch(headRefName) ?? [],
      ),
    ),
  ];
  const issues = ticketNumbers.map((number) =>
    ghJson<{
      number: number;
      title: string;
      state: string;
      labels: { name: string }[];
      assignees: { login: string }[];
    }>([
      "issue",
      "view",
      String(number),
      "-R",
      REPO_SLUG,
      "--json",
      "number,title,state,labels,assignees",
    ]),
  );
  const loopUser = gh(["api", "user", "--jq", ".login"]).trim();
  return stillInTheLoopsHands(
    pullRequests,
    issues.map(({ labels, assignees, ...issue }) => ({
      ...issue,
      labels: labels.map(({ name }) => name),
      assignees: assignees.map(({ login }) => login),
    })),
    loopUser,
  );
};
