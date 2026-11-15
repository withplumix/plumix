const FORBIDDEN = "claude";
const RULE = "AGENTS.md, Commits, branches, PRs";

export interface PullRequestNames {
  readonly branch: string;
  readonly title: string;
}

/** One line per name that holds the forbidden word, in any case. */
export function namingFindings({ branch, title }: PullRequestNames): string[] {
  const named = [
    { what: "branch name", value: branch },
    { what: "PR title", value: title },
  ];
  return named
    .filter(({ value }) => value.toLowerCase().includes(FORBIDDEN))
    .map(
      ({ what, value }) =>
        `The ${what} "${value}" contains "${FORBIDDEN}" (${RULE}).`,
    );
}
