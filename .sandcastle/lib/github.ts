import { execFileSync, spawnSync } from "node:child_process";

import type { BlockedTicket } from "./moving-blockers.js";
import type {
  GitHubPage,
  GitHubThread,
  ReviewComment,
} from "./review-threads.js";
import type { Queued } from "./run.js";
import type {
  FailingCheck,
  MergeOutcome,
  PullRequestSnapshot,
} from "./verdict.js";
import { stillInTheLoopsHands, ticketOfLoopBranch } from "./in-flight.js";
import { someTicketWaitsOnAMovingBlocker } from "./moving-blockers.js";
import { blockersNamedIn } from "./named-blockers.js";
import {
  blockFor,
  retryWhatGitHubDropped,
  retryWhatGitHubDroppedNow,
} from "./outage.js";
import {
  DECISION_LABEL,
  HUMAN_LABEL,
  MERGE_BASE,
  READY_LABEL,
  REPO_ROOT,
  REPO_SLUG,
  TRIAGE_LABEL,
  WONTFIX_LABEL,
} from "./repo.js";
import { readReviewThreads } from "./review-threads.js";
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
  retryWhatGitHubDroppedNow(
    () =>
      execFileSync("gh", [...args], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      }),
    blockFor,
  );

const ghJson = <T>(args: readonly string[]): T => JSON.parse(gh(args)) as T;

const git = (args: readonly string[], cwd = REPO_ROOT): string =>
  execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
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

const waitsOnANamedBlocker = (ticketNumber: number): boolean => {
  const text = gh([
    "issue",
    "view",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--json",
    "body,comments",
    "--jq",
    '[.body, (.comments[].body)] | join("\\n")',
  ]);
  return blockersNamedIn(text).some(
    (blocker) =>
      gh([
        "api",
        `repos/${REPO_SLUG}/issues/${blocker}`,
        "--jq",
        ".state",
      ]).trim() === "open",
  );
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
    if (
      countOpenBlockers(number) === 0 &&
      !isParentIssue(number) &&
      !waitsOnANamedBlocker(number)
    )
      return { number, title };
  }
  return undefined;
};

const READY_TICKETS_AND_THEIR_BLOCKERS_QUERY = `query($owner: String!, $name: String!, $label: String!) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, states: OPEN, labels: [$label]) {
      nodes {
        number
        assignees { totalCount }
        blockedBy(first: 50) {
          nodes {
            state
            closedByPullRequestsReferences(first: 20, includeClosedPrs: false) {
              nodes { state }
            }
          }
        }
      }
    }
  }
}`;

interface ReadyTicketAndItsBlockers {
  readonly number: number;
  readonly assignees: { readonly totalCount: number };
  readonly blockedBy: {
    readonly nodes: readonly {
      readonly state: string;
      readonly closedByPullRequestsReferences: {
        readonly nodes: readonly { readonly state: string }[];
      };
    }[];
  };
}

export const aReadyTicketWaitsOnAMovingBlocker = (
  alreadyTaken: ReadonlySet<number>,
): boolean => {
  const [owner, name] = REPO_SLUG.split("/");
  const tickets = ghJson<readonly ReadyTicketAndItsBlockers[]>([
    "api",
    "graphql",
    "-f",
    `query=${READY_TICKETS_AND_THEIR_BLOCKERS_QUERY}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `label=${READY_LABEL}`,
    "--jq",
    ".data.repository.issues.nodes",
  ]);
  return someTicketWaitsOnAMovingBlocker(
    tickets.map(({ number, assignees, blockedBy }): BlockedTicket => ({
      number,
      assigned: assignees.totalCount > 0,
      blockedBy: blockedBy.nodes.map(
        ({ state, closedByPullRequestsReferences }) => ({
          state,
          openPullRequests: closedByPullRequestsReferences.nodes.filter(
            (pullRequest) => pullRequest.state === "OPEN",
          ).length,
        }),
      ),
    })),
    alreadyTaken,
  );
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

/** Where a brief lives: the issue body, or the REST id of the comment holding it. */
export interface BriefText {
  readonly where: "body" | number;
  readonly text: string;
}

/** The issue body, then its comments oldest first. */
export const briefTexts = (ticketNumber: number): BriefText[] => [
  {
    where: "body",
    text: ghJson<{ body: string }>([
      "issue",
      "view",
      String(ticketNumber),
      "-R",
      REPO_SLUG,
      "--json",
      "body",
    ]).body,
  },
  ...ghJson<{ id: number; body: string }[][]>([
    "api",
    "--paginate",
    "--slurp",
    `repos/${REPO_SLUG}/issues/${ticketNumber}/comments`,
  ])
    .flat()
    .map(({ id, body }) => ({ where: id, text: body })),
];

export const amendBrief = (
  ticketNumber: number,
  { where, text }: BriefText,
  comment: string,
): void => {
  if (where === "body")
    gh([
      "issue",
      "edit",
      String(ticketNumber),
      "-R",
      REPO_SLUG,
      "--body",
      text,
    ]);
  else
    gh([
      "api",
      "--method",
      "PATCH",
      `repos/${REPO_SLUG}/issues/comments/${where}`,
      "-f",
      `body=${text}`,
    ]);
  gh([
    "issue",
    "comment",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--body",
    comment,
  ]);
};

export const parkTicket = (
  ticketNumber: number,
  reason: string,
  pullRequestUrl?: string,
  briefFails?: boolean,
): void => {
  const openPullRequestNote = pullRequestUrl
    ? `\n\nThe branch is pushed and ${pullRequestUrl} is open, so the work is not lost.`
    : "";
  const whoActs = briefFails
    ? "The brief disagrees with the code, so it needs fixing before the loop takes this again."
    : "The brief still stands, so this is not back to triage — it is waiting on a person.";
  gh([
    "issue",
    "comment",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--body",
    `The unattended ship loop could not land this.\n\n\`\`\`\n${reason}\n\`\`\`${openPullRequestNote}\n\n${whoActs}`,
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

export const commentOnPullRequest = (
  pullRequest: number,
  body: string,
): void => {
  gh(["pr", "comment", String(pullRequest), "-R", REPO_SLUG, "--body", body]);
};

/** Whether an issue or pull request is still open; GitHub's issues API answers for both. */
export const isOpenOnGitHub = (number: number): boolean =>
  gh([
    "api",
    `repos/${REPO_SLUG}/issues/${number}`,
    "--jq",
    ".state",
  ]).trim() === "open";

/** Says on the ticket what it waits on, in the "Blocked by" form dispatch reads. */
export const markWaiting = (
  ticketNumber: number,
  on: readonly number[],
): void => {
  gh([
    "issue",
    "comment",
    String(ticketNumber),
    "-R",
    REPO_SLUG,
    "--body",
    `Blocked by ${on.map((n) => `#${n}`).join(", ")}. The ship loop's analyst found this ticket needs them merged first; it starts once they close.`,
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

export const pushBranch = async (
  branch: string,
  worktreePath: string,
): Promise<void> => {
  await retryWhatGitHubDropped(
    async () => {
      git(["remote", "prune", "origin"], worktreePath);
      git(["push", "--force-with-lease", "-u", "origin", branch], worktreePath);
    },
    (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  );
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
  const current = ghJson<{
    state: string;
    headRefOid: string;
    autoMergeRequest: unknown;
  }>([
    "pr",
    "view",
    String(pullRequest),
    "-R",
    REPO_SLUG,
    "--json",
    "state,headRefOid,autoMergeRequest",
  ]);
  if (current.state !== "OPEN" || current.autoMergeRequest) return;
  gh([
    "pr",
    "merge",
    String(pullRequest),
    "-R",
    REPO_SLUG,
    "--squash",
    "--auto",
    "--match-head-commit",
    current.headRefOid,
  ]);
};

const checksMainRequires = (): readonly string[] =>
  ghJson<string[]>([
    "api",
    `repos/${REPO_SLUG}/rules/branches/main`,
    "--jq",
    '[.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context]',
  ]);

export const inspectPullRequest = (
  pullRequest: number,
): PullRequestSnapshot => {
  const viewed = ghJson<{
    state: string;
    mergeStateStatus: string;
    statusCheckRollup: PullRequestSnapshot["statusCheckRollup"];
    autoMergeRequest: unknown;
    headRefName: string;
    headRefOid: string;
  }>([
    "pr",
    "view",
    String(pullRequest),
    "-R",
    REPO_SLUG,
    "--json",
    "state,headRefOid,mergeStateStatus,statusCheckRollup,autoMergeRequest,headRefName",
  ]);
  if (viewed.state === "MERGED" || viewed.state === "CLOSED")
    return {
      headSha: viewed.headRefOid,
      state: viewed.state,
      mergeStateStatus: viewed.mergeStateStatus,
      statusCheckRollup: viewed.statusCheckRollup,
      isInMergeQueue: false,
      autoMergeEnabled: false,
      openCodeScanningAlerts: [],
      requiredChecks: [],
      unresolvedReviewThreads: [],
      changesRequestedBy: [],
    };
  const [owner, name] = REPO_SLUG.split("/");
  const readHeld = (cursor?: string): HeldBy =>
    ghJson<HeldBy>([
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
      ...(cursor ? ["-f", `cursor=${cursor}`] : []),
      "--jq",
      ".data.repository.pullRequest",
    ]);
  const held = readHeld();
  return {
    headSha: viewed.headRefOid,
    state: viewed.state,
    mergeStateStatus: viewed.mergeStateStatus,
    statusCheckRollup: viewed.statusCheckRollup,
    isInMergeQueue: held.isInMergeQueue,
    autoMergeEnabled: viewed.autoMergeRequest !== null,
    openCodeScanningAlerts: openCodeScanningAlerts(pullRequest),
    requiredChecks: checksMainRequires(),
    unresolvedReviewThreads: readReviewThreads(
      held.reviewThreads,
      (cursor) => readHeld(cursor).reviewThreads,
      (id, cursor) =>
        ghJson<GitHubPage<ReviewComment>>([
          "api",
          "graphql",
          "-f",
          "query=query($id:ID!,$cursor:String){node(id:$id){... on PullRequestReviewThread{comments(first:100,after:$cursor){nodes{author{login __typename} body url} pageInfo{hasNextPage endCursor}}}}}",
          "-f",
          `id=${id}`,
          "-f",
          `cursor=${cursor}`,
          "--jq",
          ".data.node.comments",
        ]),
    ),
    changesRequestedBy: held.latestReviews.nodes
      .filter(
        ({ state, author }) =>
          state === "CHANGES_REQUESTED" && author?.__typename !== "Bot",
      )
      .map(({ author }) => author?.login ?? "ghost"),
  };
};

interface Author {
  readonly login: string;
  readonly __typename: string;
}

interface HeldBy {
  readonly isInMergeQueue: boolean;
  readonly reviewThreads: GitHubPage<GitHubThread>;
  readonly latestReviews: {
    readonly nodes: readonly {
      readonly state: string;
      readonly author: Author | null;
    }[];
  };
}

const HELD_BY_QUERY = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      isInMergeQueue
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved path line
          comments(first: 100) { nodes { author { login __typename } body url } pageInfo { hasNextPage endCursor } }
        }
      }
      latestReviews(first: 50) { nodes { state author { login __typename } } }
    }
  }
}`;

export const resolveReviewThreads = (
  threadIds: readonly string[],
  headSha: string,
): void => {
  for (const threadId of threadIds) {
    gh([
      "api",
      "graphql",
      "-f",
      "query=mutation($id: ID!, $body: String!) { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $id, body: $body }) { comment { id } } }",
      "-F",
      `id=${threadId}`,
      "-f",
      `body=Addressed in ${headSha}. The local gates and independent final-commit review completed before this push.`,
    ]);
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

export const mergeGroupFailures = (
  pullRequest: number,
): readonly FailingCheck[] => {
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

export const hasMerged = (pullRequest: number): boolean =>
  ghJson<{ state: string }>([
    "pr",
    "view",
    String(pullRequest),
    "-R",
    REPO_SLUG,
    "--json",
    "state",
  ]).state === "MERGED";

export const whyTheCheckoutIsBroken = (
  repoRoot: string = REPO_ROOT,
): string | undefined => {
  const probed = spawnSync("git", ["-C", repoRoot, "rev-parse", "--git-dir"], {
    encoding: "utf8",
  });
  if (probed.status === 0) return undefined;
  const said = probed.stderr?.trim().split("\n")[0] || String(probed.error);
  return `the checkout the run ships from, ${repoRoot}, is broken: ${said}`;
};

/**
 * A run where main passed every named check: the latest merge-queue run that
 * did, so a failure on a pull request that main does not share is the branch's.
 */
export const mainPassedChecks = (
  checks: readonly string[],
): string | undefined => {
  if (checks.length === 0) return undefined;
  const runs = ghJson<{ databaseId: number; url: string }[]>([
    "run",
    "list",
    "-R",
    REPO_SLUG,
    "--workflow",
    "CI",
    "--event",
    "merge_group",
    "--status",
    "success",
    "--limit",
    "1",
    "--json",
    "databaseId,url",
  ]);
  const [latest] = runs;
  if (!latest) return undefined;
  const { jobs } = ghJson<{ jobs: { name: string; conclusion: string }[] }>([
    "run",
    "view",
    String(latest.databaseId),
    "-R",
    REPO_SLUG,
    "--json",
    "jobs",
  ]);
  const passed = new Set(
    jobs
      .filter(({ conclusion }) => conclusion === "success")
      .map(({ name }) => name),
  );
  return checks.every((check) => passed.has(check)) ? latest.url : undefined;
};

/** Whether a local branch holds commits past main; a missing branch holds none. */
export const branchCarriesWork = (branch: string): boolean => {
  const counted = spawnSync(
    "git",
    ["-C", REPO_ROOT, "rev-list", "--count", `${MERGE_BASE}..${branch}`],
    { encoding: "utf8" },
  );
  return counted.status === 0 && Number(counted.stdout.trim()) > 0;
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

export const rerunFailedJobs = (runId: string): boolean => {
  try {
    gh(["run", "rerun", runId, "-R", REPO_SLUG, "--failed"]);
    return true;
  } catch {
    return false;
  }
};

export const runStatus = (runId: string): string => {
  try {
    return gh([
      "run",
      "view",
      runId,
      "-R",
      REPO_SLUG,
      "--json",
      "status",
      "--jq",
      ".status",
    ]).trim();
  } catch {
    return "";
  }
};

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
    }>([
      "issue",
      "view",
      String(number),
      "-R",
      REPO_SLUG,
      "--json",
      "number,title,state,labels",
    ]),
  );
  return stillInTheLoopsHands(
    pullRequests,
    issues.map(({ labels, ...issue }) => ({
      ...issue,
      labels: labels.map(({ name }) => name),
    })),
  );
};

export function pullRequestForBranch(
  branch: string,
): QueuedPullRequest | undefined {
  const pullRequests = ghJson<QueuedPullRequest[]>([
    "pr",
    "list",
    "-R",
    REPO_SLUG,
    "--head",
    branch,
    "--state",
    "all",
    "--limit",
    "1",
    "--json",
    "number,url",
  ]);
  return pullRequests[0];
}
