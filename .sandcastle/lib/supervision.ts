import type { Queued } from "./run.js";
import type { ShipHistory } from "./ship-history.js";
import type {
  FailingCheck,
  MergeOutcome,
  PullRequestSnapshot,
} from "./verdict.js";
import { judgeQueuedPullRequest } from "./verdict.js";

export type SupervisionAction =
  | { readonly type: "wait"; readonly until: number; readonly reason: string }
  | { readonly type: "requeue" }
  | { readonly type: "finish"; readonly outcome: MergeOutcome };

export function inspectDelivery(
  queued: Queued,
  snapshot: PullRequestSnapshot,
  history: ShipHistory,
  now: number,
): SupervisionAction {
  const verdict = judgeQueuedPullRequest(snapshot);
  const last = history.observation(queued.pullRequest.number);
  const previous = last?.headSha === snapshot.headSha ? last : undefined;
  const missingChecks =
    verdict.status === "missing-required-checks"
      ? (previous?.missingChecks ?? 0) + 1
      : 0;
  const queueDrops =
    verdict.status === "left-the-queue" ? (previous?.queueDrops ?? 0) + 1 : 0;
  const decision =
    verdict.status === "failed" &&
    verdict.needsAPerson &&
    snapshot.state === "OPEN";
  if (
    verdict.status === "merged" ||
    (verdict.status === "failed" && !decision)
  ) {
    const reason = verdict.status === "merged" ? "merged" : verdict.reason;
    history.record({
      type: "pr.observed",
      issue: queued.ticket.number,
      pullRequest: queued.pullRequest.number,
      headSha: snapshot.headSha,
      verdict: verdict.status,
      reason,
      nextCheckAt: now,
      missingChecks: 0,
      queueDrops: 0,
    });
    return {
      type: "finish",
      outcome:
        verdict.status === "merged"
          ? verdict
          : { ...verdict, headSha: snapshot.headSha },
    };
  }
  let reason =
    decision && verdict.status === "failed"
      ? verdict.reason
      : "checks or merge queue pending";
  if (verdict.status === "missing-required-checks" && missingChecks >= 3) {
    reason = `${verdict.checks.join(", ")} never ran; the ruleset or workflow needs a person's decision`;
  }
  const until = now + 120_000;
  history.record({
    type: "pr.observed",
    issue: queued.ticket.number,
    pullRequest: queued.pullRequest.number,
    headSha: snapshot.headSha,
    verdict: decision || missingChecks >= 3 ? "decision" : "waiting",
    reason,
    nextCheckAt: until,
    missingChecks,
    queueDrops,
  });
  if (queueDrops >= 2) return { type: "requeue" };
  return { type: "wait", until, reason };
}

export interface SupervisorPorts {
  readonly inspect: () => PullRequestSnapshot;
  readonly now: () => number;
  readonly pause: (ms: number) => Promise<void>;
  readonly requeue: () => void;
  readonly queueFailures: () => readonly FailingCheck[];
  readonly say: (line: string) => void;
}

export async function supervisePullRequest(
  queued: Queued,
  history: ShipHistory,
  ports: SupervisorPorts,
): Promise<MergeOutcome> {
  for (;;) {
    const previous = history.observation(queued.pullRequest.number);
    const waitMs = (previous?.nextCheckAt ?? 0) - ports.now();
    if (waitMs > 0) await ports.pause(waitMs);
    const action = inspectDelivery(
      queued,
      ports.inspect(),
      history,
      ports.now(),
    );
    if (action.type === "finish") return action.outcome;
    if (action.type === "requeue") {
      const failingChecks = ports.queueFailures();
      if (failingChecks.length > 0)
        return {
          status: "failed",
          headSha: history.observation(queued.pullRequest.number)?.headSha,
          fromTheMergeGroup: true,
          reason: "merge group failed",
          failingChecks,
        };
      ports.requeue();
    }
    if (action.type === "wait" && action.reason !== previous?.reason) {
      ports.say(`#${queued.pullRequest.number} ${action.reason}`);
    }
  }
}
