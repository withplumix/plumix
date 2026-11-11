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
    throw new Error(
      `Repair needs manual recovery of unpublished commits on ${branch}`,
    );
  }
  git(["branch", "-f", branch, `origin/${branch}`]);
}
