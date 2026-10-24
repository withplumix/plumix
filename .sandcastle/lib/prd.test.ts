import { describe, expect, test } from "vitest";

import type { SubIssue } from "./prd.js";
import { jobForLeaf, nextSubIssue, prdPullRequestCopy } from "./prd.js";

const sub = (
  number: number,
  over: Partial<Omit<SubIssue, "number">> = {},
): SubIssue => ({
  number,
  title: `t${number}`,
  open: true,
  assigned: false,
  blockedBy: [],
  ...over,
});

describe("nextSubIssue", () => {
  test("takes the lowest open sub-issue nothing blocks", () => {
    expect(nextSubIssue([sub(12), sub(11)], new Set())?.number).toBe(11);
  });

  test("a sub-issue blocked by one this branch already implemented comes next, without waiting for a merge", () => {
    const subs = [
      sub(11),
      sub(12, { blockedBy: [{ number: 11, open: true }] }),
    ];

    expect(nextSubIssue(subs, new Set([11]))?.number).toBe(12);
  });

  test("a sub-issue blocked by an open issue outside the branch waits", () => {
    const subs = [sub(12, { blockedBy: [{ number: 99, open: true }] })];

    expect(nextSubIssue(subs, new Set())).toBeUndefined();
  });

  test("a closed blocker does not hold a sub-issue back", () => {
    const subs = [sub(12, { blockedBy: [{ number: 99, open: false }] })];

    expect(nextSubIssue(subs, new Set())?.number).toBe(12);
  });

  test("skips closed sub-issues, ones already done here, and ones another pull request holds", () => {
    const subs = [
      sub(10, { open: false }),
      sub(11),
      sub(12, { assigned: true }),
      sub(13),
    ];

    expect(nextSubIssue(subs, new Set([11]))?.number).toBe(13);
  });
});

describe("prdPullRequestCopy", () => {
  const prd = { number: 3241, title: "own an editor's lease in one module" };
  const done = (
    number: number,
    title: string,
    body = `**Fixes #${number}**`,
  ) => ({
    ticket: { number, title: `t${number}` },
    copy: { title, body },
  });

  test("fixes every sub-issue the branch implemented and says which PRD it is part of", () => {
    const { body } = prdPullRequestCopy(prd, [
      done(3242, "feat(admin): add the controller"),
      done(3243, "feat(admin): move the entry routes"),
    ]);

    expect(body).toContain("Part of #3241");
    expect(body).toContain("**Fixes #3242**");
    expect(body).toContain("**Fixes #3243**");
  });

  test("keeps the scope when every sub-issue shares it", () => {
    const { title } = prdPullRequestCopy(prd, [
      done(3242, "feat(admin): add the controller"),
      done(3243, "fix(admin): keep the lease"),
    ]);

    expect(title).toBe("feat(admin): own an editor's lease in one module");
  });

  test("drops the scope when the sub-issues touch different packages, since commitlint takes one", () => {
    const { title } = prdPullRequestCopy(prd, [
      done(3242, "feat(admin): add the controller"),
      done(3246, "feat(plugin-media): move media onto it"),
    ]);

    expect(title).toBe("feat: own an editor's lease in one module");
  });

  test("a breaking sub-issue marks the whole pull request breaking", () => {
    const { title } = prdPullRequestCopy(prd, [
      done(3242, "feat(core)!: change the contract"),
      done(3243, "fix(core): follow it"),
    ]);

    expect(title).toBe("feat(core)!: own an editor's lease in one module");
  });

  test("a PRD of fixes only is titled a fix", () => {
    const { title } = prdPullRequestCopy(prd, [
      done(3242, "fix(core): one"),
      done(3243, "fix(core): two"),
    ]);

    expect(title).toBe("fix(core): own an editor's lease in one module");
  });
});

describe("jobForLeaf", () => {
  const leaf = { number: 3242, title: "add the controller" };
  const parent = (
    over: Partial<{ ready: boolean; claimed: boolean }> = {},
  ) => ({
    number: 3241,
    title: "own an editor's lease in one module",
    ready: true,
    claimed: false,
    ...over,
  });

  test("a leaf with no parent ships alone", () => {
    expect(jobForLeaf(leaf, undefined)).toEqual({ ...leaf });
  });

  test("a leaf under a ready PRD ships as the PRD, so its siblings follow on the same branch", () => {
    expect(jobForLeaf(leaf, parent())).toEqual({
      number: 3241,
      title: "own an editor's lease in one module",
      prd: true,
    });
  });

  test("a leaf whose PRD is already being shipped is skipped, so no second branch races the first", () => {
    expect(jobForLeaf(leaf, parent({ claimed: true }))).toBeUndefined();
  });

  test("a leaf under a parent nobody marked ready ships alone", () => {
    expect(jobForLeaf(leaf, parent({ ready: false }))).toEqual({ ...leaf });
  });
});
