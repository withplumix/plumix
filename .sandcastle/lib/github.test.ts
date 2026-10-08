import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { pushBranch } from "./github.js";

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const commit = (cwd: string, file: string): void => {
  writeFileSync(join(cwd, file), file);
  git(cwd, "add", file);
  git(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", file);
};

const cloneOf = (remote: string): string => {
  const clone = mkdtempSync(join(tmpdir(), "push-clone-"));
  git(clone, "clone", "-q", remote, ".");
  return clone;
};

describe("pushBranch", () => {
  test("pushes a ticket branch whose earlier remote branch was deleted after its pull request merged", async () => {
    const remote = mkdtempSync(join(tmpdir(), "push-remote-"));
    git(remote, "init", "-q", "--bare", "-b", "main");
    const seed = cloneOf(remote);
    commit(seed, "readme");
    git(seed, "push", "-q", "origin", "HEAD:main");

    const worktree = cloneOf(remote);
    git(worktree, "switch", "-qc", "feat/ticket");
    commit(worktree, "first-attempt");
    await pushBranch("feat/ticket", worktree);
    git(seed, "push", "-q", "origin", "--delete", "feat/ticket");

    git(worktree, "reset", "-q", "--hard", "origin/main");
    commit(worktree, "second-attempt");
    await pushBranch("feat/ticket", worktree);

    expect(git(remote, "rev-parse", "feat/ticket")).toBe(
      git(worktree, "rev-parse", "HEAD"),
    );
  });

  test("still refuses to overwrite a remote branch someone else moved", async () => {
    const remote = mkdtempSync(join(tmpdir(), "push-remote-"));
    git(remote, "init", "-q", "--bare", "-b", "main");
    const seed = cloneOf(remote);
    commit(seed, "readme");
    git(seed, "push", "-q", "origin", "HEAD:main");

    const worktree = cloneOf(remote);
    git(worktree, "switch", "-qc", "feat/ticket");
    commit(worktree, "ours");
    await pushBranch("feat/ticket", worktree);
    git(seed, "fetch", "-q", "origin", "feat/ticket");
    git(seed, "switch", "-qc", "feat/ticket", "FETCH_HEAD");
    commit(seed, "theirs");
    git(seed, "push", "-q", "origin", "feat/ticket");
    const theirs = git(seed, "rev-parse", "HEAD");

    commit(worktree, "ours-again");
    await expect(pushBranch("feat/ticket", worktree)).rejects.toThrow(
      /stale info/,
    );
    expect(git(remote, "rev-parse", "feat/ticket")).toBe(theirs);
  });
});
