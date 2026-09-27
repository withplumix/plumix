import { describe, expect, test } from "vitest";

import { CHANGESET_GATE, GATES } from "./gates.js";
import { looksLikeTheRunBeingOver } from "./outage.js";
import { workersALaneOversubscribes } from "./sandbox.js";
import {
  readDeclinedTag,
  readFindingsTag,
  readPullRequestTag,
  refuseToJudgeAgainstARedMain,
} from "./ticket.js";

const TICKET = { number: 42, title: "a feed is its archive's own entry query" };

const findingsBlock = (json: string) =>
  `chatter before\n<findings>\n${json}\n</findings>\nchatter after`;

describe("readFindingsTag", () => {
  test("accepts failure_scenario, which is the vocabulary sentry-skills:code-review emits", () => {
    const review = readFindingsTag(
      findingsBlock(
        '{"findings":[{"file":"a.ts","line":3,"severity":"high","summary":"s","failure_scenario":"boom"}]}',
      ),
    );

    expect(review.emittedParseableFindings).toBe(true);
    expect(review.findings[0]?.why).toBe("boom");
  });

  test("accepts why, which is the vocabulary the prompt asks for", () => {
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
      TICKET,
    );

    expect(copy.title).toBe("fix(core): clamp the thing");
    expect(copy.body).toBe("**Fixes #42**\n\n- [x] done");
  });

  test("falls back to a body that references the ticket when the implementer emits no block", () => {
    const copy = readPullRequestTag("no tag here", TICKET);

    expect(copy.title).toContain(TICKET.title);
    expect(copy.body).toContain("**Fixes #42**");
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

    expect(unconditional).toContain("typecheck");
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

describe("refuseToJudgeAgainstARedMain", () => {
  const redKnip = {
    name: "knip",
    command: "pnpm knip",
    output: "Unused exported types (1)\nPublicAuthor  type  schemas.ts:78:13",
  };

  test("a green main lets the ticket be judged on every gate", () => {
    expect(() => refuseToJudgeAgainstARedMain([])).not.toThrow();
  });

  test("a gate red on main stops the run instead of being skipped for the ticket", () => {
    expect(() => refuseToJudgeAgainstARedMain([redKnip])).toThrow(
      /main is red in the sandbox \(knip\)/,
    );
  });

  test("the refusal carries what the gate printed, so a person can act on it", () => {
    expect(() => refuseToJudgeAgainstARedMain([redKnip])).toThrow(
      /Unused exported types \(1\)/,
    );
  });

  test("the refusal is one the loop treats as the run being over", () => {
    try {
      refuseToJudgeAgainstARedMain([redKnip]);
    } catch (error) {
      expect(looksLikeTheRunBeingOver(String(error))).toBe(true);
    }
  });
});
