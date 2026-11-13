import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { RunAgentPhase } from "./agent.js";
import type { Review } from "./ticket.js";
import { PROMPT_DIR } from "./agent.js";
import { GATES, GATES_LEFT_TO_CI, underAnOrphanReaper } from "./gates.js";
import {
  SETUP_STEPS,
  TASKS_A_LANE_RUNS_AT_ONCE,
  testWorkersEachTaskGets,
} from "./sandbox.js";
import {
  afterImplementing,
  afterReview,
  commitsTheBranchCarries,
  fixerFor,
  gatesUntilGreen,
  IMPLEMENTER,
  MAX_REVIEW_FIX_ROUNDS,
  readDeclinedTag,
  readFindingsTag,
  readGuidanceTag,
  readPullRequestTag,
  readReviewTag,
  readTemplatedPullRequest,
  reviewBeforePublishing,
  reviewBranch,
  reviewUntilClosed,
} from "./ticket.js";

const TICKET = { number: 42, title: "a feed is its archive's own entry query" };

const findingsBlock = (json: string) =>
  `chatter before\n<findings>\n${json}\n</findings>\nchatter after`;

describe("IMPLEMENTER", () => {
  test("implementation runs on Opus", () => {
    expect(IMPLEMENTER.model).toBe("claude-opus-5-5");
  });
});

describe("afterImplementing", () => {
  test("work with commits goes on to review", () => {
    expect(
      afterImplementing({ commits: 2, declined: null, unblocked: false }),
    ).toBe("review");
  });

  test("an implementation that commits nothing and says nothing goes to the lead to unblock", () => {
    expect(
      afterImplementing({ commits: 0, declined: null, unblocked: false }),
    ).toBe("unblock");
  });

  test("a stated reason to decline is about the brief, so it goes to the decider rather than the lead", () => {
    expect(
      afterImplementing({
        commits: 0,
        declined: "the brief contradicts main",
        unblocked: false,
      }),
    ).toBe("block");
  });

  test("committing nothing even with the lead's guidance blocks the ticket", () => {
    expect(
      afterImplementing({ commits: 0, declined: null, unblocked: true }),
    ).toBe("block");
  });
});

describe("readGuidanceTag", () => {
  test("reads the lead's guidance", () => {
    expect(
      readGuidanceTag("…\n<guidance>\nStart from define.ts:41\n</guidance>"),
    ).toBe("Start from define.ts:41");
  });

  test("no guidance is null, so an empty answer never counts as unblocking", () => {
    expect(readGuidanceTag("<guidance>\n\n</guidance>")).toBeNull();
  });
});

describe("readFindingsTag", () => {
  test("reads why a finding matters", () => {
    const review = readFindingsTag(
      findingsBlock(
        '{"findings":[{"file":"a.ts","severity":"low","summary":"s","why":"because"}]}',
      ),
    );

    expect(review.findings[0]?.why).toBe("because");
  });

  test("keeps a finding whose severity is unrecognised rather than discarding the whole review", () => {
    const review = readFindingsTag(
      findingsBlock(
        '{"findings":[{"file":"a.ts","severity":"catastrophic","summary":"s","why":"w"}]}',
      ),
    );

    expect(review.emittedParseableFindings).toBe(true);
    expect(review.findings[0]?.severity).toBe("medium");
  });

  test("reports an absent block as unparseable, which is not the same as clean", () => {
    const review = readFindingsTag(
      "the reviewer rambled and never emitted the tag",
    );

    expect(review.emittedParseableFindings).toBe(false);
    expect(review.findings).toEqual([]);
  });

  test("reports malformed json as unparseable", () => {
    const review = readFindingsTag(findingsBlock("{not json"));

    expect(review.emittedParseableFindings).toBe(false);
  });
});

describe("readPullRequestTag", () => {
  test("takes the title and the body verbatim", () => {
    const copy = readPullRequestTag(
      "<pr>\ntitle: fix(core): clamp the thing\nbody:\n**Fixes #42**\n\n- [x] done\n</pr>",
    );

    expect(copy?.title).toBe("fix(core): clamp the thing");
    expect(copy?.body).toBe("**Fixes #42**\n\n- [x] done");
  });

  test("reads nothing when the implementer emits no block", () => {
    expect(readPullRequestTag("no tag here")).toBeNull();
  });
});

const prBlock = (body: string) =>
  `<pr>\ntitle: fix(core): clamp the thing\nbody:\n${body}\n</pr>`;
const TEMPLATED_BODY = [
  "**Fixes #42**",
  "## Summary",
  "clamp(value)",
  "## Evidence",
  "- **Before:** fails\n  **After:** passes",
  "## Merge Danger",
  "**Door:** two-way",
  "**Blast Radius:** small",
].join("\n\n");

describe("readTemplatedPullRequest", () => {
  test("takes a body written in the pr skill's template", () => {
    expect(readTemplatedPullRequest(prBlock(TEMPLATED_BODY))?.body).toBe(
      TEMPLATED_BODY,
    );
  });

  test.each([
    "## Summary",
    "## Evidence",
    "## Merge Danger",
    "**Door:**",
    "**Blast Radius:**",
  ])("reads nothing when the body has no %s", (section) => {
    expect(
      readTemplatedPullRequest(prBlock(TEMPLATED_BODY.replace(section, ""))),
    ).toBeNull();
  });
});

describe("gate applicability", () => {
  const e2e = GATES_LEFT_TO_CI.find(({ name }) => name === "e2e");

  test("e2e applies to a render change", () => {
    expect(
      e2e?.appliesWhen?.(["packages/core/src/route/archive-entries.ts"]),
    ).toBe(true);
  });

  test("e2e does not apply to a docs-only change", () => {
    expect(
      e2e?.appliesWhen?.(["docs/adr/0008-archive-is-one-entry-query.md"]),
    ).toBe(false);
  });

  test("every gate that is always required runs unconditionally", () => {
    const unconditional = GATES.filter(({ appliesWhen }) => !appliesWhen).map(
      ({ name }) => name,
    );

    expect(unconditional).toContain("format");
    expect(unconditional).toContain("knip");
  });

  test("typecheck runs before the pull request, so CI does not find what it would", () => {
    const unconditional = GATES.filter(({ appliesWhen }) => !appliesWhen).map(
      ({ name }) => name,
    );

    expect(unconditional).toContain("typecheck");
  });
});

describe("readDeclinedTag", () => {
  test("reads the reason a fixer gave for changing nothing", () => {
    expect(
      readDeclinedTag(
        "chatter\n<declined>\nThe host is missing Playwright's system libraries.\n</declined>\nmore",
      ),
    ).toBe("The host is missing Playwright's system libraries.");
  });

  test("a fixer that simply committed declines nothing", () => {
    expect(readDeclinedTag("done, committed as abc123")).toBeNull();
  });

  test("an empty block counts as no reason given", () => {
    expect(readDeclinedTag("<declined>\n\n</declined>")).toBeNull();
  });
});

describe("testWorkersEachTaskGets", () => {
  test.each([1, 2, 3, 4])(
    "%i lane(s) of test workers stay inside a ten-core host",
    (lanes) => {
      expect(
        lanes * TASKS_A_LANE_RUNS_AT_ONCE * testWorkersEachTaskGets(lanes, 10),
      ).toBeLessThanOrEqual(10);
    },
  );

  test("a task keeps one worker however many lanes share the host", () => {
    expect(testWorkersEachTaskGets(16, 10)).toBe(1);
  });
});

describe("gatesUntilGreen", () => {
  const gates = [
    { name: "typecheck", command: "typecheck" },
    { name: "e2e", command: "e2e" },
    { name: "test", command: "test" },
  ];
  const journal = { record: () => {} };
  const GATE_NAMES = ["e2e", "test", "typecheck"];
  const sandbox = (
    fails: (command: string) => boolean,
    ran: string[] = [],
  ) => ({
    exec: async (reaped: string) => {
      const command =
        GATE_NAMES.find((name) => underAnOrphanReaper(name) === reaped) ??
        reaped;
      ran.push(command);
      return {
        exitCode: fails(command) ? 1 : 0,
        stdout: "",
        stderr: `${command} failed`,
        durationMs: 0,
      };
    },
  });

  test("a gate the fixer says the branch did not break is waived, and the gates after it still run", async () => {
    const ran: string[] = [];
    const outcome = await gatesUntilGreen(
      sandbox((command) => command === "e2e", ran),
      gates,
      journal,
      {
        apply: async () => ({
          declined: {
            reason: "a startup race in plumix dev that main has too",
            notThisBranch: true,
          },
          pullRequestCopy: null,
        }),
      },
      "final",
    );

    expect(outcome).toEqual({
      blocked: null,
      waived: [
        {
          command: "e2e",
          reason: "a startup race in plumix dev that main has too",
        },
      ],
    });
    expect(ran).toContain("test");
  });

  test("a gate the fixer fixes is not waived", async () => {
    let fixed = false;
    const outcome = await gatesUntilGreen(
      sandbox((command) => command === "e2e" && !fixed),
      gates,
      journal,
      {
        apply: async () => {
          fixed = true;
          return { declined: null, pullRequestCopy: null };
        },
      },
      "final",
    );

    expect(outcome).toEqual({ blocked: null, waived: [] });
  });

  test("a gate still failing after every fix round blocks the ticket", async () => {
    const outcome = await gatesUntilGreen(
      sandbox((command) => command === "typecheck"),
      gates,
      journal,
      { apply: async () => ({ declined: null, pullRequestCopy: null }) },
      "final",
    );

    expect(outcome.blocked).toMatch(/still failing `typecheck`/);
  });
});

describe("sandbox setup", () => {
  test("installs the Bun the repo pins, before anything that runs its suites", () => {
    const bun = SETUP_STEPS.findIndex((step) => step.includes(".bun-version"));

    expect(bun).toBeGreaterThanOrEqual(0);
    expect(bun).toBeLessThan(
      SETUP_STEPS.findIndex((step) => step === "pnpm build"),
    );
  });
});

const reviewBlock = (review: object) =>
  `chatter\n<review>\n${JSON.stringify(review)}\n</review>\n`;

describe("readReviewTag", () => {
  test("reads what the reviewer changed, the spec gaps it left, and its notes", () => {
    const review = readReviewTag(
      reviewBlock({
        summary: "renamed a helper",
        specGaps: [
          { file: "a.ts", line: 3, summary: "criterion 2 unmet", why: "w" },
        ],
        notes: [
          { file: "b.ts", summary: "kept the duplicate the ticket pins" },
        ],
      }),
    );

    expect(review?.summary).toBe("renamed a helper");
    expect(review?.specGaps.map(({ file }) => file)).toEqual(["a.ts"]);
    expect(review?.notes.map(({ why }) => why)).toEqual([""]);
  });

  test("reads nothing from a message without the block", () => {
    expect(readReviewTag("all good, nothing to add")).toBeNull();
  });

  test("reads nothing from malformed json", () => {
    expect(readReviewTag("<review>{not json</review>")).toBeNull();
  });
});

describe("reviewBranch", () => {
  const ranWith = (stdout: string) =>
    ({
      stdout,
      iterations: [{ sessionId: "s" }],
      commits: [],
    }) as unknown as Awaited<ReturnType<RunAgentPhase>>;

  test("asks the reviewer again for a block it could not read, and tallies spec gaps as blocking", async () => {
    const phases: string[] = [];
    const recorded: { phase: string; high?: number; low?: number }[] = [];

    const review = await reviewBranch(
      async (phase) => {
        phases.push(phase);
        return phase === "review#2"
          ? ranWith("I fixed two names")
          : ranWith(
              reviewBlock({
                summary: "fixed two names",
                specGaps: [{ file: "a.ts", summary: "criterion 1 unmet" }],
                notes: [
                  { file: "b.ts", summary: "n" },
                  { file: "c.ts", summary: "n" },
                ],
              }),
            );
      },
      {
        record: ({ phase, findings }) =>
          recorded.push({ phase, high: findings?.high, low: findings?.low }),
      },
      TICKET,
      2,
      "body",
      "",
    );

    expect(phases).toEqual(["review#2", "review#2:ask-again1"]);
    expect(review?.specGaps).toHaveLength(1);
    expect(recorded).toEqual([{ phase: "review#2:findings", high: 1, low: 2 }]);
  });

  const scopeOf = async (round: number | string) => {
    let scope: unknown;
    await reviewBranch(
      async (_phase, _agent, options) => {
        scope = options.promptArgs?.SCOPE;
        return ranWith(reviewBlock({ summary: "", specGaps: [], notes: [] }));
      },
      { record: () => {} },
      TICKET,
      round,
      "body",
      "",
    );
    return scope;
  };

  test("every placeholder in the review prompt gets a value, since a missing one fails the phase", async () => {
    let given: string[] = [];
    await reviewBranch(
      async (_phase, _agent, options) => {
        given = Object.keys(options.promptArgs ?? {});
        return ranWith(reviewBlock({ summary: "", specGaps: [], notes: [] }));
      },
      { record: () => {} },
      TICKET,
      1,
      "body",
      "",
    );
    const prompt = readFileSync(join(PROMPT_DIR, "review.md"), "utf8");
    const wanted = [...prompt.matchAll(/\{\{(\w+)\}\}/g)].map(([, key]) => key);

    expect(given).toEqual(expect.arrayContaining(wanted));
  });

  test("a review pass inside the loop holds every line to the checklist", async () => {
    expect(await scopeOf(1)).toBe("");
  });

  test.each(["publish", "repair-publish"])(
    "the %s review blocks only on the spec, since the loop already held the lines to the checklist",
    async (round) => {
      const scope = await scopeOf(round);

      expect(scope).toContain('checklist "no" goes in `notes`');
      expect(scope).toContain("criterion");
    },
  );

  test("hands the reviewer the lines mutation testing found", async () => {
    const promptArgs: unknown[] = [];

    await reviewBranch(
      async (_phase, _agent, options) => {
        promptArgs.push(options.promptArgs ?? {});
        return ranWith(reviewBlock({ summary: "", specGaps: [], notes: [] }));
      },
      { record: () => {} },
      TICKET,
      1,
      "body",
      "# 1 surviving line in 1 package\n",
    );

    expect(promptArgs[0]).toMatchObject({
      MUTATION: "# 1 surviving line in 1 package\n",
    });
  });

  test("journals gaps that need a decision apart from the ones the fixer can close", async () => {
    const recorded: { high?: number; medium?: number }[] = [];

    await reviewBranch(
      async () =>
        ranWith(
          reviewBlock({
            summary: "",
            specGaps: [
              { file: "a.ts", summary: "criterion 1 unmet" },
              { file: "b.ts", summary: "brief vs code", needsADecision: true },
            ],
            notes: [],
          }),
        ),
      {
        record: ({ findings }) =>
          recorded.push({ high: findings?.high, medium: findings?.medium }),
      },
      TICKET,
      1,
      "body",
      "",
    );

    expect(recorded).toEqual([{ high: 1, medium: 1 }]);
  });
});

describe("afterReview", () => {
  const review = (specGaps: { summary: string; needsADecision?: boolean }[]) =>
    readReviewTag(
      reviewBlock({
        summary: "",
        specGaps: specGaps.map((gap) => ({ file: "a.ts", why: "w", ...gap })),
        notes: [],
      }),
    )!;

  test("a review with no spec gaps lets the branch go to the gates", () => {
    expect(afterReview(review([]), 1)).toEqual({ next: "gates" });
  });

  test("the fixer is handed only the gaps it can close", () => {
    const next = afterReview(
      review([
        { summary: "criterion 2 unmet" },
        { summary: "the brief contradicts the code", needsADecision: true },
      ]),
      1,
    );

    expect(next.next).toBe("fix");
    expect(
      next.next === "fix" && next.gaps.map(({ summary }) => summary),
    ).toEqual(["criterion 2 unmet"]);
  });

  test("gaps that only a decision can close go to the decider at once, naming each one", () => {
    const next = afterReview(
      review([
        {
          summary: "the adapter shape departs from the brief",
          needsADecision: true,
        },
      ]),
      1,
    );

    expect(next.next).toBe("decide");
    expect(next.next === "decide" && next.reason).toContain(
      "a.ts — the adapter shape departs from the brief",
    );
  });

  test("gaps on the last round go to the fixer, not to a park", () => {
    const next = afterReview(
      review([{ summary: "criterion 2 unmet" }]),
      MAX_REVIEW_FIX_ROUNDS,
    );

    expect(next).toMatchObject({ next: "fix", lastRound: true });
  });

  test("a decision gap on the last round is decided before the branch ships past it", () => {
    const next = afterReview(
      review([
        { summary: "criterion 2 unmet" },
        { summary: "the brief contradicts the code", needsADecision: true },
      ]),
      MAX_REVIEW_FIX_ROUNDS,
    );

    expect(next).toMatchObject({ next: "decide", lastRound: true });
    expect(next.next === "decide" && next.gaps).toHaveLength(2);
  });
});

describe("reviewUntilClosed", () => {
  const copy = { title: "t", body: "b" };
  const gap = { file: "a.ts", summary: "criterion 2 unmet", why: "w" };
  const aReview = (specGaps: object[]) =>
    readReviewTag(reviewBlock({ summary: "", specGaps, notes: [] }))!;
  const decisionGap = { ...gap, needsADecision: true };

  const loop = (
    reviews: (Review | null)[],
    {
      decide = async () => null,
      declines = [],
    }: {
      decide?: (reason: string) => Promise<string | null>;
      declines?: boolean[];
    } = {},
  ) => {
    const seen: string[] = [];
    const briefs: string[] = [];
    return {
      seen,
      briefs,
      ports: {
        review: async (pass: number) => {
          seen.push(`review${pass}`);
          return reviews.length > 0 ? (reviews.shift() ?? null) : aReview([]);
        },
        fixer: {
          apply: async (phase: string, brief: string) => {
            seen.push(phase);
            briefs.push(brief);
            return {
              declined: declines.shift()
                ? { reason: "cannot close it", notThisBranch: false }
                : null,
              pullRequestCopy: null,
            };
          },
        },
        decide: async (reason: string) => {
          seen.push("decide");
          return decide(reason);
        },
      },
    };
  };

  test("the gaps of the last review are fixed and the branch ships without another review", async () => {
    const { ports, seen } = loop([aReview([gap]), aReview([gap])]);

    const outcome = await reviewUntilClosed(ports, copy);

    expect(outcome.status).toBe("closed");
    expect(seen).toEqual(["review1", "fix#review1", "review2", "fix#review2"]);
  });

  test("a decided gap stays on the branch: the fixer closes it with the decision in hand", async () => {
    const { ports, seen, briefs } = loop([aReview([decisionGap])], {
      decide: async () => "the ADR settles it",
    });

    const outcome = await reviewUntilClosed(ports, copy);

    expect(outcome.status).toBe("closed");
    expect(seen).toEqual(["review1", "decide", "fix#decided1", "review2"]);
    expect(briefs[0]).toContain("the ADR settles it");
    expect(briefs[0]).toContain("criterion 2 unmet");
  });

  test("a fix declined outright goes to the decider and is tried again", async () => {
    const { ports, seen } = loop([aReview([gap])], {
      decide: async () => "the brief was wrong",
      declines: [true, false],
    });

    const outcome = await reviewUntilClosed(ports, copy);

    expect(outcome.status).toBe("closed");
    expect(seen).toEqual([
      "review1",
      "fix#review1",
      "decide",
      "fix#decided1",
      "review2",
    ]);
  });

  test("a gap the documents do not settle goes to a person, marked as already decided", async () => {
    const { ports } = loop([aReview([decisionGap])]);

    const outcome = await reviewUntilClosed(ports, copy);

    expect(outcome).toMatchObject({ status: "blocked", alreadyDecided: true });
    expect(outcome.status === "blocked" && outcome.reason).toContain(
      "criterion 2 unmet",
    );
  });

  test("each decision gap goes to the decider, whose port holds the ticket's re-plan budget", async () => {
    const { ports, seen } = loop(
      [aReview([decisionGap]), aReview([decisionGap])],
      { decide: async () => "settled" },
    );

    const outcome = await reviewUntilClosed(ports, copy);

    expect(outcome.status).toBe("closed");
    expect(seen.filter((step) => step === "decide")).toHaveLength(2);
  });

  test("an unreadable review blocks the ticket, since the branch is unreviewed", async () => {
    const { ports } = loop([null]);

    const outcome = await reviewUntilClosed(ports, copy);

    expect(outcome.status).toBe("blocked");
    expect(outcome.status === "blocked" && outcome.reason).toContain(
      "unreviewed",
    );
  });
});

describe("reviewBeforePublishing", () => {
  const copy = { title: "t", body: "b" };
  const gap = { file: "a.ts", summary: "the changeset overclaims", why: "w" };
  const aReview = (specGaps: object[]) =>
    readReviewTag(reviewBlock({ summary: "", specGaps, notes: [] }))!;

  const publishing = (
    reviews: (Review | null)[],
    {
      declines = false,
      gateFails = null,
      fixedCopy = null,
      decide = async () => null,
    }: {
      declines?: boolean;
      gateFails?: string | null;
      fixedCopy?: { title: string; body: string } | null;
      decide?: (reason: string) => Promise<string | null>;
    } = {},
  ) => {
    const seen: string[] = [];
    const reviewedBodies: string[] = [];
    const briefs: string[] = [];
    return {
      seen,
      reviewedBodies,
      briefs,
      ports: {
        decide: async (reason: string) => {
          seen.push("decide");
          return decide(reason);
        },
        review: async (pullRequestBody: string) => {
          seen.push("review");
          reviewedBodies.push(pullRequestBody);
          return reviews.shift() ?? null;
        },
        fixer: {
          apply: async (phase: string, brief: string) => {
            seen.push(phase);
            briefs.push(brief);
            return declines
              ? {
                  declined: { reason: "cannot", notThisBranch: false },
                  pullRequestCopy: null,
                }
              : { declined: null, pullRequestCopy: fixedCopy };
          },
        },
        regate: async () => {
          seen.push("gates");
          return gateFails;
        },
      },
    };
  };

  test("gaps the final review finds go back to the fixer, are gated, and reviewed again before the push", async () => {
    const fixedCopy = { title: "t2", body: "b2" };
    const { ports, seen, reviewedBodies } = publishing(
      [aReview([gap]), aReview([])],
      { fixedCopy },
    );

    const outcome = await reviewBeforePublishing(ports, copy);

    expect(outcome).toEqual({ status: "closed", pullRequestCopy: fixedCopy });
    expect(seen).toEqual(["review", "fix#publish1", "gates", "review"]);
    expect(reviewedBodies).toEqual(["b", "b2"]);
  });

  test("a checklist point the final review files as a gap does not hold the push", async () => {
    const { ports, seen } = publishing([aReview([{ ...gap, checklist: 3 }])]);

    const outcome = await reviewBeforePublishing(ports, copy);

    expect(outcome).toEqual({ status: "closed", pullRequestCopy: copy });
    expect(seen).toEqual(["review"]);
  });

  test("only the spec gaps go to the fixer when the final review mixes them with checklist points", async () => {
    const { ports, briefs } = publishing([
      aReview([{ ...gap, checklist: 3, summary: "a comment narrates" }, gap]),
      aReview([]),
    ]);

    await reviewBeforePublishing(ports, copy);

    expect(briefs[0]).toContain("the changeset overclaims");
    expect(briefs[0]).not.toContain("a comment narrates");
  });

  test("gaps the final review still finds after its fix round park the ticket", async () => {
    const { ports } = publishing([aReview([gap]), aReview([gap])]);

    const outcome = await reviewBeforePublishing(ports, copy);

    expect(outcome.status).toBe("blocked");
    expect(outcome.status === "blocked" && outcome.reason).toContain(
      "Final commit review",
    );
  });

  test("a gap that needs a decision goes to the decider, and the fixer closes it with the decision in hand", async () => {
    const { ports, seen, briefs } = publishing(
      [aReview([{ ...gap, needsADecision: true }]), aReview([])],
      { decide: async () => "the ADR settles it" },
    );

    const outcome = await reviewBeforePublishing(ports, copy);

    expect(outcome.status).toBe("closed");
    expect(seen).toEqual([
      "review",
      "decide",
      "fix#publish1",
      "gates",
      "review",
    ]);
    expect(briefs[0]).toContain("the ADR settles it");
  });

  test("a gap the documents do not settle parks for a person, marked as already decided", async () => {
    const { ports, seen } = publishing([
      aReview([{ ...gap, needsADecision: true }]),
    ]);

    const outcome = await reviewBeforePublishing(ports, copy);

    expect(outcome).toMatchObject({ status: "blocked", alreadyDecided: true });
    expect(seen).toEqual(["review", "decide"]);
  });

  test("a fix the gates reject parks with the gate's reason", async () => {
    const { ports } = publishing([aReview([gap])], {
      gateFails: "format failed",
    });

    const outcome = await reviewBeforePublishing(ports, copy);

    expect(outcome).toEqual({ status: "blocked", reason: "format failed" });
  });

  test("a fix declined outright parks with the fixer's reason and the gaps", async () => {
    const { ports } = publishing([aReview([gap])], { declines: true });

    const outcome = await reviewBeforePublishing(ports, copy);

    expect(outcome.status === "blocked" && outcome.reason).toContain("cannot");
    expect(outcome.status === "blocked" && outcome.reason).toContain(
      "the changeset overclaims",
    );
  });

  test("an unreadable final review parks, since the commit is unreviewed", async () => {
    const { ports } = publishing([null]);

    const outcome = await reviewBeforePublishing(ports, copy);

    expect(outcome).toEqual({
      status: "blocked",
      reason: "Final commit has no readable independent review",
    });
  });
});

describe("fixerFor", () => {
  const fixedWith = (stdout: string, commits: number) =>
    (async () => ({
      stdout,
      commits: Array.from({ length: commits }, () => ({ sha: "abc" })),
      iterations: [{ sessionId: "s2" }],
    })) as unknown as RunAgentPhase;

  test("a fix that only corrects the PR description declines nothing and hands back the new copy", async () => {
    const fixer = fixerFor(
      fixedWith(
        "<pr>\ntitle: refactor(core): lift meta\nbody:\n**Fixes #2594**\n\nThe error map stays at src/rpc-errors.ts.\n</pr>",
        0,
      ),
      "s1",
    );

    const result = await fixer.apply("fix#review2", "the description is stale");

    expect(result).toEqual({
      declined: null,
      pullRequestCopy: {
        title: "refactor(core): lift meta",
        body: "**Fixes #2594**\n\nThe error map stays at src/rpc-errors.ts.",
      },
    });
  });

  test("a fix that changes nothing and rewrites nothing is declined", async () => {
    const fixer = fixerFor(fixedWith("I looked around.", 0), "s1");

    const result = await fixer.apply("fix#review2", "gap");

    expect(result.declined?.reason).toBe(
      "the fixer changed nothing and gave no reason",
    );
  });
});

describe("commitsTheBranchCarries", () => {
  const sandboxWhereGitSays = (stdout: string, exitCode = 0) => ({
    exec: async (command: string) => ({
      exitCode:
        command === "git rev-list --count origin/main..HEAD" ? exitCode : 1,
      stdout,
      stderr: "",
      durationMs: 0,
    }),
  });

  test("counts the commits ahead of main, so a commit the agent made before it lost track of its session still ships", async () => {
    expect(await commitsTheBranchCarries(sandboxWhereGitSays("1\n"))).toBe(1);
  });

  test("a branch level with main carries none", async () => {
    expect(await commitsTheBranchCarries(sandboxWhereGitSays("0\n"))).toBe(0);
  });

  test("a git that cannot answer counts as none, so the ticket parks instead of shipping nothing", async () => {
    expect(await commitsTheBranchCarries(sandboxWhereGitSays("", 128))).toBe(0);
  });
});
