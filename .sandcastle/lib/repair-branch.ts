import { leftoverSandboxWorktree } from "./worktrees.js";

export function prepareRepairBranch(
  branch: string,
  repoRoot: string,
  git: (args: readonly string[]) => string,
): void {
  const worktree = leftoverSandboxWorktree(
    git(["worktree", "list", "--porcelain"]),
    repoRoot,
    branch,
  );
  if (worktree)
    throw new Error(
      `Repair needs manual recovery of preserved worktree ${worktree}`,
    );
  const localBranch = git([
    "for-each-ref",
    "--format=%(refname)",
    `refs/heads/${branch}`,
  ]).trim();
  if (
    localBranch &&
    Number(git(["rev-list", "--count", `origin/${branch}..${branch}`]).trim()) >
      0
  ) {
    if (holdsEveryPushedCommit(branch, git)) return;
    throw new Error(
      `Repair needs manual recovery of unpublished commits on ${branch}`,
    );
  }
  git(["branch", "-f", branch, `origin/${branch}`]);
}

/**
 * An earlier repair that stopped before its push leaves the loop's own commits
 * on top of what it rebased; when every pushed commit has a copy here, the
 * local branch supersedes the PR and the repair continues from it.
 */
function holdsEveryPushedCommit(
  branch: string,
  git: (args: readonly string[]) => string,
): boolean {
  return !git(["cherry", branch, `origin/${branch}`])
    .split("\n")
    .some((line) => line.startsWith("+"));
}
