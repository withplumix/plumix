import type { Ticket } from "./github.js";
import type { PullRequestCopy } from "./ticket.js";

export interface SubIssue {
  readonly number: number;
  readonly title: string;
  readonly open: boolean;
  readonly assigned: boolean;
  readonly blockedBy: readonly {
    readonly number: number;
    readonly open: boolean;
  }[];
}

export const nextSubIssue = (
  subIssues: readonly SubIssue[],
  doneOnThisBranch: ReadonlySet<number>,
): SubIssue | undefined =>
  [...subIssues]
    .sort((a, b) => a.number - b.number)
    .find(
      ({ number, open, assigned, blockedBy }) =>
        open &&
        !assigned &&
        !doneOnThisBranch.has(number) &&
        blockedBy.every(
          (blocker) => !blocker.open || doneOnThisBranch.has(blocker.number),
        ),
    );

const SUBJECT = /^(\w+)(?:\(([^)]+)\))?(!)?:/;

export const prdPullRequestCopy = (
  prd: Ticket,
  implemented: readonly { ticket: Ticket; copy: PullRequestCopy }[],
): PullRequestCopy => {
  const subjects = implemented.map(({ copy }) => SUBJECT.exec(copy.title));
  const type = subjects.some((subject) => subject?.[1] !== "fix")
    ? "feat"
    : "fix";
  const scopes = new Set(subjects.map((subject) => subject?.[2]));
  const [onlyScope] = scopes;
  const scope = scopes.size === 1 && onlyScope ? `(${onlyScope})` : "";
  const breaking = subjects.some((subject) => subject?.[3]) ? "!" : "";
  const sections = implemented.map(
    ({ ticket, copy }) =>
      `## #${ticket.number} ${ticket.title}\n\n${copy.body}`,
  );
  return {
    title: `${type}${scope}${breaking}: ${prd.title}`,
    body: [
      `Part of #${prd.number}. The ship loop implemented these sub-issues on one branch, one after another, so this one pull request carries them all.`,
      ...sections,
    ].join("\n\n"),
  };
};

export interface ParentOfALeaf {
  readonly number: number;
  readonly title: string;
  readonly ready: boolean;
  readonly claimed: boolean;
}

export const jobForLeaf = (
  leaf: Ticket,
  parent: ParentOfALeaf | undefined,
): Ticket | undefined => {
  if (!parent?.ready) return { number: leaf.number, title: leaf.title };
  if (parent.claimed) return undefined;
  return { number: parent.number, title: parent.title, prd: true };
};
