import { describe, expect, test } from "vitest";

import { prepareRepairBranch } from "./repair-branch.js";

describe("prepareRepairBranch", () => {
  test("a branch with no local work is reset to the fetched PR head", () => {
    const writes: string[][] = [];
    const git = (args: readonly string[]): string => {
      if (args[0] === "worktree") return "";
      if (args[0] === "for-each-ref") return "";
      writes.push([...args]);
      return "";
    };

    prepareRepairBranch("feat/fix-3450", "/repo", git);

    expect(writes).toEqual([
      ["branch", "-f", "feat/fix-3450", "origin/feat/fix-3450"],
    ]);
  });

  test("unpublished local commits are preserved instead of resetting the branch to GitHub", () => {
    const writes: string[][] = [];
    const git = (args: readonly string[]): string => {
      if (args[0] === "worktree") return "";
      if (args[0] === "for-each-ref") return "refs/heads/feat/fix-3450\n";
      if (args[0] === "rev-list") return "1\n";
      writes.push([...args]);
      return "";
    };

    expect(() => prepareRepairBranch("feat/fix-3450", "/repo", git)).toThrow(
      "unpublished commits",
    );
    expect(writes).toEqual([]);
  });

  test("a leftover worktree is preserved instead of being removed for a repair", () => {
    const writes: string[][] = [];
    const git = (args: readonly string[]): string => {
      if (args[0] === "worktree" && args[1] === "list") {
        return "worktree /repo/.sandcastle/worktrees/feat-fix-3450\nbranch refs/heads/feat/fix-3450\n";
      }
      writes.push([...args]);
      return "";
    };

    expect(() => prepareRepairBranch("feat/fix-3450", "/repo", git)).toThrow(
      "preserved worktree",
    );
    expect(writes).toEqual([]);
  });
});
