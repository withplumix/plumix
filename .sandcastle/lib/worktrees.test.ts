import { describe, expect, test } from "vitest";

import { leftoverSandboxWorktree } from "./worktrees.js";

const ROOT = "/repo";
const listing = [
  "worktree /repo",
  "HEAD 1111111",
  "branch refs/heads/main",
  "",
  "worktree /repo/.sandcastle/worktrees/feat-cli-errors-2472",
  "HEAD 2222222",
  "branch refs/heads/feat/cli-errors-2472",
  "",
  "worktree /repo/.sandcastle/worktrees/feat-bun-runtime-2685",
  "HEAD 4444444",
  "detached",
  "",
  "worktree /elsewhere/someone-else",
  "HEAD 3333333",
  "branch refs/heads/feat/theirs-9999",
  "",
].join("\n");

describe("leftoverSandboxWorktree", () => {
  test("finds the sandbox worktree a cut-off run left on the ticket's branch", () => {
    expect(leftoverSandboxWorktree(listing, ROOT, "feat/cli-errors-2472")).toBe(
      "/repo/.sandcastle/worktrees/feat-cli-errors-2472",
    );
  });

  test("leaves a worktree outside the loop's own directory alone", () => {
    expect(
      leftoverSandboxWorktree(listing, ROOT, "feat/theirs-9999"),
    ).toBeUndefined();
  });

  test("a branch no worktree holds has nothing to clear", () => {
    expect(
      leftoverSandboxWorktree(listing, ROOT, "feat/never-started-1"),
    ).toBeUndefined();
  });

  test("finds a worktree a cut-off rebase left detached, by the directory named after the branch", () => {
    expect(
      leftoverSandboxWorktree(listing, ROOT, "feat/bun-runtime-2685"),
    ).toBe("/repo/.sandcastle/worktrees/feat-bun-runtime-2685");
  });
});
