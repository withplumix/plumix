import { describe, expect, test } from "vitest";

import { looksLikeAnOutage, looksLikeTheHarnessFailing } from "./outage.js";

describe("looksLikeAnOutage", () => {
  test.each([
    "Claude AI usage limit reached",
    "rate_limit_error: too many requests",
    "HTTP 429 Too Many Requests",
    "Your credit balance is too low to access the Anthropic API",
    "quota exceeded for this organisation",
    "401 Unauthorized",
    "authentication_error: invalid x-api-key",
    "OAuth token has expired",
    "API Error: 529 overloaded_error",
  ])("stops the run on %s", (reason) => {
    expect(looksLikeAnOutage(reason)).toBe(true);
  });

  test.each([
    "the implementer produced no commits",
    "still failing `pnpm test:e2e` after 4 fix rounds",
    "2 high-severity finding(s) still open after 3 review rounds",
    "pull request was closed without merging",
    "the fixer changed nothing: the host is missing libnss3",
  ])("parks the ticket on %s", (reason) => {
    expect(looksLikeAnOutage(reason)).toBe(false);
  });
});

describe("looksLikeTheHarnessFailing", () => {
  test.each([
    'Command failed (exit 128): git config --global --add safe.directory "/home/agent/workspace"\nfatal: not a git repository: /x/.git/worktrees/feat-y',
    "fatal: 'feat-x' is already checked out at '/x/worktrees/feat-x'",
    "Error response from daemon: conflict: unable to delete container",
    "docker: Cannot connect to the Docker daemon",
    "Command failed (exit 128): git worktree add",
  ])("releases the ticket rather than blaming it: %s", (reason) => {
    expect(looksLikeTheHarnessFailing(reason)).toBe(true);
  });

  test.each([
    "still failing `pnpm test:e2e` after 4 fix rounds",
    "the implementer produced no commits",
    "the fixer changed nothing: the host is missing libnss3",
    "failing checks: Test, Lint",
  ])("leaves a real ticket failure alone: %s", (reason) => {
    expect(looksLikeTheHarnessFailing(reason)).toBe(false);
  });
});
