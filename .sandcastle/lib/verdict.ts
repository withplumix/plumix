export interface FailingCheck {
  readonly name: string;
  readonly url?: string;
}

export type MergeOutcome =
  | { readonly status: "merged" }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly failingChecks: readonly FailingCheck[];
      readonly conflicted?: boolean;
      readonly codeScanningAlerts?: readonly string[];
      readonly reviewThreads?: readonly ReviewThread[];
      readonly needsAPerson?: boolean;
    };

export interface ReviewThread {
  readonly id: string;
  readonly author: string;
  readonly byABot: boolean;
  readonly location: string;
  readonly body: string;
  readonly url: string;
}

export interface PullRequestSnapshot {
  readonly state: string;
  readonly mergeStateStatus: string;
  readonly statusCheckRollup: readonly {
    readonly name?: string;
    readonly conclusion?: string;
    readonly status?: string;
    readonly detailsUrl?: string;
  }[];
  readonly isInMergeQueue: boolean;
  readonly autoMergeEnabled: boolean;
  readonly openCodeScanningAlerts: readonly string[];
  readonly unresolvedReviewThreads: readonly ReviewThread[];
  readonly changesRequestedBy: readonly string[];
}

export type QueueVerdict =
  | MergeOutcome
  | { readonly status: "waiting" }
  | { readonly status: "left-the-queue" };

export const judgeQueuedPullRequest = (
  pullRequest: PullRequestSnapshot,
): QueueVerdict => {
  if (pullRequest.state === "MERGED") return { status: "merged" };
  if (pullRequest.state === "CLOSED") {
    return {
      status: "failed",
      reason: "pull request was closed without merging",
      failingChecks: [],
    };
  }
  if (pullRequest.mergeStateStatus === "DIRTY") {
    return {
      status: "failed",
      reason: "the branch conflicts with main, so the queue will never take it",
      failingChecks: [],
      conflicted: true,
    };
  }

  const failingChecks = pullRequest.statusCheckRollup
    .filter(({ conclusion }) => conclusion === "FAILURE")
    .map(({ name, detailsUrl }) => ({
      name: name ?? "unnamed",
      url: detailsUrl,
    }));
  if (failingChecks.length > 0) {
    return {
      status: "failed",
      reason: `failing checks: ${failingChecks.map(({ name }) => name).join(", ")}`,
      failingChecks,
    };
  }

  const checksStillRunning = pullRequest.statusCheckRollup.some(
    ({ status }) => status !== undefined && status !== "COMPLETED",
  );
  if (checksStillRunning) return { status: "waiting" };

  if (pullRequest.isInMergeQueue) return { status: "waiting" };

  const byPeople = pullRequest.unresolvedReviewThreads.filter(
    ({ byABot }) => !byABot,
  );
  if (byPeople.length > 0 || pullRequest.changesRequestedBy.length > 0) {
    const who = [
      ...pullRequest.changesRequestedBy.map(
        (login) => `${login} requested changes`,
      ),
      ...byPeople.map(
        ({ author, url }) => `${author} left an open thread: ${url}`,
      ),
    ];
    return {
      status: "failed",
      reason: `a person's review holds the merge — ${who.join("; ")}`,
      failingChecks: [],
      needsAPerson: true,
    };
  }

  if (pullRequest.openCodeScanningAlerts.length > 0) {
    return {
      status: "failed",
      reason: `code scanning blocks the merge: ${pullRequest.openCodeScanningAlerts.join("; ")}`,
      failingChecks: [],
      codeScanningAlerts: pullRequest.openCodeScanningAlerts,
    };
  }

  if (pullRequest.unresolvedReviewThreads.length > 0) {
    return {
      status: "failed",
      reason: `unresolved review threads from ${[...new Set(pullRequest.unresolvedReviewThreads.map(({ author }) => author))].join(", ")}`,
      failingChecks: [],
      reviewThreads: pullRequest.unresolvedReviewThreads,
    };
  }

  if (!pullRequest.isInMergeQueue && !pullRequest.autoMergeEnabled) {
    return { status: "left-the-queue" };
  }
  return { status: "waiting" };
};
