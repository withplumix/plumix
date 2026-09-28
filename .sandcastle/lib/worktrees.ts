import { join } from "node:path";

export const leftoverSandboxWorktree = (
  porcelainListing: string,
  repoRoot: string,
  branch: string,
): string | undefined => {
  const sandboxDirectory = join(repoRoot, ".sandcastle", "worktrees");
  return porcelainListing
    .split("\n\n")
    .map((entry) => ({
      path: entry.match(/^worktree (.+)$/m)?.[1],
      branch: entry.match(/^branch refs\/heads\/(.+)$/m)?.[1],
    }))
    .find(
      (worktree) =>
        worktree.branch === branch &&
        worktree.path?.startsWith(`${sandboxDirectory}/`),
    )?.path;
};
