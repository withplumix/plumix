import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  inspectPullRequest,
  pushBranch,
  whyTheCheckoutIsBroken,
} from "./github.js";

test("a merged PR is recovered even when its deleted head cannot be inspected", () => {
  const bin = mkdtempSync(join(tmpdir(), "ship-gh-"));
  const before = process.env.PATH;
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env node\nif (process.argv[2] !== "pr" || process.argv[3] !== "view") process.exit(42);\nconsole.log(JSON.stringify({state:"MERGED",headRefOid:"abc",mergeStateStatus:"UNKNOWN",statusCheckRollup:[],autoMergeRequest:null}));\n`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  process.env.PATH = `${bin}:${before}`;
  try {
    expect(inspectPullRequest(101).state).toBe("MERGED");
  } finally {
    process.env.PATH = before;
    rmSync(bin, { recursive: true });
  }
});

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

const seedOf = (remote: string): string => {
  const seed = mkdtempSync(join(tmpdir(), "push-seed-"));
  git(seed, "init", "-q", "-b", "main");
  git(seed, "remote", "add", "origin", remote);
  commit(seed, "readme");
  git(seed, "push", "-q", "origin", "HEAD:main");
  return seed;
};

describe("pushBranch", () => {
  test("pushes a ticket branch whose earlier remote branch was deleted after its pull request merged", async () => {
    const remote = mkdtempSync(join(tmpdir(), "push-remote-"));
    git(remote, "init", "-q", "--bare", "-b", "main");
    const seed = seedOf(remote);

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
    const seed = seedOf(remote);

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

describe("whyTheCheckoutIsBroken", () => {
  test("finds nothing wrong with a checkout git still knows", () => {
    const checkout = mkdtempSync(join(tmpdir(), "checkout-"));
    git(checkout, "init", "-q");

    expect(whyTheCheckoutIsBroken(checkout)).toBeUndefined();
  });

  test("names the checkout when git no longer knows it as a repository", () => {
    const checkout = mkdtempSync(join(tmpdir(), "checkout-"));
    writeFileSync(join(checkout, ".git"), "gitdir: /gone/.git/worktrees/x\n");

    // Git versions describe a dangling gitfile differently; the diagnostic must
    // identify our checkout and retain Git's failure, whichever wording it uses.
    const reason = whyTheCheckoutIsBroken(checkout);
    expect(reason).toContain(
      `the checkout the run ships from, ${checkout}, is broken:`,
    );
    expect(reason).toContain("fatal:");
  });
});
