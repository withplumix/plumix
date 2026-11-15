import type { ShipHistory } from "./ship-history.js";

interface SquashedCommit {
  readonly committedAtMs: number;
  readonly subject: string;
  readonly message: string;
  readonly files: readonly string[];
  readonly pullRequest?: number;
}

interface QualityCounts {
  readonly merged: number;
  readonly reverted: number;
  readonly followUpFixes: number;
}

interface MonthQuality {
  readonly month: string;
  readonly loop: QualityCounts;
  readonly other: QualityCounts;
}

/** Commit date and message per record, so `--name-only` appends each commit's files as a last field. */
export const MAIN_HISTORY_FORMAT = "%x1e%cI%x1f%B%x1f";

const PULL_REQUEST_SUFFIX = / \(#(\d+)\)$/;
const REVERT_SUBJECT = /^Revert "(.*)"(?: \(#\d+\))?$/;
const REVERTS_LINE = /^Reverts (?:[\w.-]+\/[\w.-]+)?#(\d+)\s*$/m;
const FIX_SUBJECT = /^fix(\([^)]*\))?!?:/;
const FOLLOW_UP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REPORTED_MONTHS = 6;
const FROM_GITHUB = "the merged PRs the gh account opened from a loop branch";

function pullRequestOf(subject: string): number | undefined {
  const digits = PULL_REQUEST_SUFFIX.exec(subject)?.[1];
  return digits ? Number(digits) : undefined;
}

function commitsIn(gitLog: string): readonly SquashedCommit[] {
  return gitLog
    .split("\x1e")
    .filter((record) => record.trim())
    .map((record) => {
      const [committedAt = "", message = "", files = ""] = record.split("\x1f");
      const subject = message.split("\n")[0]?.trim() ?? "";
      return {
        committedAtMs: Date.parse(committedAt),
        subject,
        message,
        files: files.split("\n").filter((file) => file.trim()),
        pullRequest: pullRequestOf(subject),
      };
    });
}

/** GitHub's revert button writes `Reverts owner/repo#N`; `git revert` quotes the reverted subject. */
function revertTargetOf({
  subject,
  message,
}: SquashedCommit): number | undefined {
  const revertedSubject = REVERT_SUBJECT.exec(subject)?.[1];
  if (revertedSubject === undefined) return undefined;
  const named = REVERTS_LINE.exec(message)?.[1];
  return named ? Number(named) : pullRequestOf(revertedSubject);
}

/** A PR stays reverted only while one of its reverts is not itself reverted. */
function revertedPullRequests(
  commits: readonly SquashedCommit[],
): ReadonlySet<number> {
  const revertsOf = new Map<number, (number | undefined)[]>();
  for (const commit of commits) {
    const target = revertTargetOf(commit);
    if (target === undefined) continue;
    const reverts = revertsOf.get(target) ?? [];
    reverts.push(commit.pullRequest);
    revertsOf.set(target, reverts);
  }
  const standsReverted = (pullRequest: number): boolean =>
    (revertsOf.get(pullRequest) ?? []).some(
      (revert) => revert === undefined || !standsReverted(revert),
    );
  return new Set([...revertsOf.keys()].filter(standsReverted));
}

function fixTimesByFile(
  commits: readonly SquashedCommit[],
): ReadonlyMap<string, readonly number[]> {
  const times = new Map<string, number[]>();
  for (const commit of commits) {
    if (!FIX_SUBJECT.test(commit.subject)) continue;
    for (const file of commit.files) {
      const fixedAt = times.get(file) ?? [];
      fixedAt.push(commit.committedAtMs);
      times.set(file, fixedAt);
    }
  }
  return times;
}

function hasFollowUpFix(
  merged: SquashedCommit,
  fixTimes: ReadonlyMap<string, readonly number[]>,
): boolean {
  return merged.files.some((file) =>
    (fixTimes.get(file) ?? []).some((fixedAt) => {
      const after = fixedAt - merged.committedAtMs;
      return after > 0 && after <= FOLLOW_UP_WINDOW_MS;
    }),
  );
}

function monthOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/**
 * Counts each month's squash-merged PRs from `git log --name-only` output in
 * `MAIN_HISTORY_FORMAT`. Reverts and fixes merged after the month still count.
 */
export function postMergeQuality(
  gitLog: string,
  loopOwned: ReadonlySet<number>,
  months: readonly string[],
): readonly MonthQuality[] {
  const commits = commitsIn(gitLog);
  const reverted = revertedPullRequests(commits);
  const fixTimes = fixTimesByFile(commits);
  const countsOf = (merged: readonly SquashedCommit[]): QualityCounts => ({
    merged: merged.length,
    reverted: merged.filter(({ pullRequest }) => reverted.has(pullRequest!))
      .length,
    followUpFixes: merged.filter((commit) => hasFollowUpFix(commit, fixTimes))
      .length,
  });
  return months.map((month) => {
    const mergedInMonth = commits.filter(
      ({ pullRequest, committedAtMs }) =>
        pullRequest !== undefined && monthOf(committedAtMs) === month,
    );
    return {
      month,
      loop: countsOf(
        mergedInMonth.filter(({ pullRequest }) => loopOwned.has(pullRequest!)),
      ),
      other: countsOf(
        mergedInMonth.filter(({ pullRequest }) => !loopOwned.has(pullRequest!)),
      ),
    };
  });
}

export interface PostMergeQualitySources {
  /** `git log --name-only` of main since the ISO instant, in `MAIN_HISTORY_FORMAT`. */
  readonly mainHistorySince: (since: string) => string;
  readonly loopPullRequestsMergedIn: (
    months: readonly string[],
  ) => ReadonlySet<number>;
}

function monthsEndingAt(now: Date): readonly string[] {
  return Array.from({ length: REPORTED_MONTHS }, (_, index) =>
    monthOf(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - (REPORTED_MONTHS - 1 - index),
      ),
    ),
  );
}

interface LoopOwnership {
  readonly pullRequests: ReadonlySet<number>;
  readonly source: string;
}

/** Journals live only in the checkout that ran the loop, so GitHub covers the months before them. */
function loopOwnership(
  history: ShipHistory,
  months: readonly string[],
  sources: PostMergeQualitySources,
): LoopOwnership {
  const tracked = history.events.flatMap(({ event }) =>
    event.type === "pr.tracked" ? [event.pullRequest.number] : [],
  );
  const firstRecordedAt = history.events[0]?.at.slice(0, 10);
  if (tracked.length === 0 || firstRecordedAt === undefined)
    return {
      pullRequests: sources.loopPullRequestsMergedIn(months),
      source: `GitHub, ${FROM_GITHUB} (no local ship journal tracks a PR)`,
    };
  const fromJournals = `local ship journals (from ${firstRecordedAt})`;
  const beforeJournals = months.filter(
    (month) => month <= firstRecordedAt.slice(0, 7),
  );
  if (beforeJournals.length === 0)
    return { pullRequests: new Set(tracked), source: fromJournals };
  return {
    pullRequests: new Set([
      ...tracked,
      ...sources.loopPullRequestsMergedIn(beforeJournals),
    ]),
    source: `${fromJournals}, and GitHub for ${beforeJournals[0]} to ${beforeJournals.at(-1)}, ${FROM_GITHUB}`,
  };
}

function share(count: number, merged: number): string {
  if (merged === 0) return String(count);
  return `${count} (${((count / merged) * 100).toFixed(1)}%)`;
}

function row(label: string, loop: QualityCounts, other: QualityCounts): string {
  const cells = [loop, other].flatMap(({ merged, reverted, followUpFixes }) => [
    String(merged),
    share(reverted, merged),
    share(followUpFixes, merged),
  ]);
  return `| ${[label, ...cells].join(" | ")} |`;
}

function sum(counts: readonly QualityCounts[]): QualityCounts {
  return {
    merged: counts.reduce((total, { merged }) => total + merged, 0),
    reverted: counts.reduce((total, { reverted }) => total + reverted, 0),
    followUpFixes: counts.reduce(
      (total, { followUpFixes }) => total + followUpFixes,
      0,
    ),
  };
}

export function postMergeQualityReport(
  history: ShipHistory,
  now: Date,
  sources: PostMergeQualitySources,
): string {
  const months = monthsEndingAt(now);
  const ownership = loopOwnership(history, months, sources);
  const quality = postMergeQuality(
    sources.mainHistorySince(
      new Date(`${months[0]}-01T00:00:00Z`).toISOString(),
    ),
    ownership.pullRequests,
    months,
  );
  return [
    "Post-merge quality by UTC month of merge",
    `Loop ownership: ${ownership.source}.`,
    "",
    "| month | loop merged | reverted | follow-up fix | other merged | reverted | follow-up fix |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...quality.map(({ month, loop, other }) => row(month, loop, other)),
    row(
      `${REPORTED_MONTHS} months`,
      sum(quality.map(({ loop }) => loop)),
      sum(quality.map(({ other }) => other)),
    ),
    "",
    'Reverted: a later Revert "…" commit names the PR, and no revert of that revert followed. Follow-up fix: a fix commit merged within 7 days after the PR touches at least one of its files. Merges in the last 7 days may still gain one.',
  ].join("\n");
}
