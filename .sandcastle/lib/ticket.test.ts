import { describe, expect, test } from "vitest";

import type { RunAgentPhase } from "./agent.js";
import { CHANGESET_GATE, GATES, underAnOrphanReaper } from "./gates.js";
import { SETUP_STEPS, workersALaneOversubscribes } from "./sandbox.js";
import {
  asReviewNote,
  fixerFor,
  gatesUntilGreen,
  readDeclinedTag,
  readFindingsTag,
  readPullRequestTag,
  readReviewTag,
  reviewBranch,
} from "./ticket.js";

const TICKET = { number: 42, title: "a feed is its archive's own entry query" };

const findingsBlock = (json: string) =>
  `chatter before\n<findings>\n${json}\n</findings>\nchatter after`;

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

describe("gate applicability", () => {
  const e2e = GATES.find(({ name }) => name === "e2e");

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

  test("the changeset gate applies when a published package changes", () => {
    expect(
      CHANGESET_GATE.appliesWhen?.(["packages/plugins/feeds/src/items.ts"]),
    ).toBe(true);
  });

  test.each([
    "packages/admin-ui/src/input-group.tsx",
    "packages/core/locales/en.po",
    "packages/plugins/media/package.json",
  ])("a change consumers install needs a changeset: %s", (path) => {
    expect(CHANGESET_GATE.appliesWhen?.([path])).toBe(true);
  });

  test.each([
    "packages/admin-ui/scripts/roster.ts",
    "packages/admin-editor/src/block-i18n.test.ts",
    "packages/admin-editor/test/lingui-macro-stub.ts",
    "packages/admin/e2e/editor.spec.ts",
    "packages/admin-editor/vitest.config.ts",
    "packages/admin-editor/tsconfig.json",
  ])("a change nothing installs needs none: %s", (path) => {
    expect(CHANGESET_GATE.appliesWhen?.([path])).toBe(false);
  });

  test("one shipped file among unshipped ones still needs a changeset", () => {
    expect(
      CHANGESET_GATE.appliesWhen?.([
        "packages/admin-ui/scripts/roster.ts",
        "packages/admin-ui/src/destructive.ts",
      ]),
    ).toBe(true);
  });

  test("the changeset gate does not apply to a tooling-only change", () => {
    expect(
      CHANGESET_GATE.appliesWhen?.(["tooling/eslint/src/rules/foo.ts"]),
    ).toBe(false);
  });

  test("every gate that is always required runs unconditionally", () => {
    const unconditional = GATES.filter(({ appliesWhen }) => !appliesWhen).map(
      ({ name }) => name,
    );

    expect(unconditional).toContain("format");
    expect(unconditional).toContain("test");
    expect(unconditional).toContain("knip");
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

describe("workersALaneOversubscribes", () => {
  test("two lanes stay inside a ten-core host", () => {
    expect(workersALaneOversubscribes(2)).toBeLessThanOrEqual(10);
  });

  test("the count grows with lanes, because every lane runs its own turbo", () => {
    expect(workersALaneOversubscribes(4)).toBe(
      workersALaneOversubscribes(2) * 2,
    );
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
    );

    expect(phases).toEqual(["review#2", "review#2:ask-again1"]);
    expect(review?.specGaps).toHaveLength(1);
    expect(recorded).toEqual([{ phase: "review#2:findings", high: 1, low: 2 }]);
  });
});

describe("asReviewNote", () => {
  test("records what each review pass changed and what it chose to leave, with why", () => {
    const note = asReviewNote(
      ["renamed a helper", ""],
      [
        {
          file: "b.ts",
          line: 4,
          summary: "kept the duplicate",
          why: "the ticket pins it",
        },
      ],
    );

    expect(note).toContain("renamed a helper");
    expect(note).toContain("`b.ts:4` — kept the duplicate: the ticket pins it");
  });

  test("adds nothing when the review changed nothing and left nothing", () => {
    expect(asReviewNote(["", ""], [])).toBe("");
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
