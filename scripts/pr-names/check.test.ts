import { describe, expect, test } from "vitest";

import { namingFindings } from "./check.ts";

describe("namingFindings", () => {
  test("a branch and title without the word pass", () => {
    expect(
      namingFindings({
        branch: "docs/tag-written-rules",
        title: "docs: tag each written rule",
      }),
    ).toEqual([]);
  });

  test("a branch holding the word is a finding", () => {
    expect(
      namingFindings({
        branch: "claude/fix-login",
        title: "fix(core): keep the session",
      }),
    ).toEqual([
      'The branch name "claude/fix-login" contains "claude" (AGENTS.md, Commits, branches, PRs).',
    ]);
  });

  test("a title holding the word in any case is a finding", () => {
    expect(
      namingFindings({
        branch: "fix/login",
        title: "fix(core): Claude's session fix",
      }),
    ).toEqual([
      `The PR title "fix(core): Claude's session fix" contains "claude" (AGENTS.md, Commits, branches, PRs).`,
    ]);
  });

  test("the word inside a longer name is still a finding", () => {
    expect(
      namingFindings({ branch: "feat/askCLAUDEcode", title: "feat: ask" }),
    ).toHaveLength(1);
  });

  test("a branch and title both holding the word give one finding each", () => {
    expect(
      namingFindings({ branch: "claude-x", title: "chore: claude" }),
    ).toHaveLength(2);
  });
});
