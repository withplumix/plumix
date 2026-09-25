import { describe, expect, test } from "vitest";

import {
  awaitingAnAnswer,
  blockerEdges,
  briefGaps,
  briefWithColdReadNotes,
  classifyIssueBody,
  readVerdictTag,
  sharedPackages,
} from "./triage.js";

const withDirection = `## Problem

\`seedFromMetaBoxes\` answers a missing value with the field's default.

## Direction

Make \`read-service.ts\` the only owner of the media list query.

## Acceptance

- one query owns conditions, search and order
- the browse path calls it or is removed
`;

describe("classifyIssueBody", () => {
  test("a settled direction with acceptance criteria is specified", () => {
    expect(classifyIssueBody(withDirection)).toBe("specified");
  });

  test("a decision-for-triage heading is an open decision, however full the acceptance", () => {
    expect(
      classifyIssueBody(
        `## Decision for triage\n\nEither:\n\n1. Implement it.\n2. Remove it.\n\n## Acceptance\n\n- a\n- b\n- c\n`,
      ),
    ).toBe("open-decision");
  });

  test("prose deferring the direction is an open decision even with no heading for it", () => {
    expect(
      classifyIssueBody(
        `## Direction (to be grilled, not assumed)\n\n1. A marker.\n2. Seed only when new.\n\n## Acceptance\n\nUnset until the direction is chosen.\n`,
      ),
    ).toBe("open-decision");
  });

  test("enumerated options under a direction heading are an open decision", () => {
    expect(
      classifyIssueBody(
        `## Direction\n\n1. Implement it.\n2. Remove it.\n\n## Acceptance\n\n- a\n- b\n`,
      ),
    ).toBe("open-decision");
  });

  test("no acceptance section at all is unspecified", () => {
    expect(classifyIssueBody(`## Problem\n\nSomething is wrong.\n`)).toBe(
      "unspecified",
    );
  });

  test("an empty body is unspecified rather than a crash", () => {
    expect(classifyIssueBody("")).toBe("unspecified");
  });
});

const COMPLETE_BRIEF = `## Agent Brief

**Category:** bug
**Summary:** one line

**Current behavior:**
It throws.

**Desired behavior:**
It does not throw.

**Key interfaces:**
- \`TestResponse\`: gains a resolved template

**Acceptance criteria:**
- [ ] it asserts on the resolved template
- [ ] a test covers it

**Out of scope:**
- the themes phase
`;

describe("briefGaps", () => {
  test("a brief with every section and a checklist has no gaps", () => {
    expect(briefGaps(COMPLETE_BRIEF)).toEqual([]);
  });

  test("a missing section is named", () => {
    expect(briefGaps(COMPLETE_BRIEF.replace("**Out of scope:**", ""))).toEqual([
      "Out of scope",
    ]);
  });

  test("acceptance criteria that are not a checklist do not count as criteria", () => {
    expect(briefGaps(COMPLETE_BRIEF.replace(/- \[ \] /g, "- "))).toContain(
      "Acceptance criteria",
    );
  });

  test("an empty brief names every section rather than passing vacuously", () => {
    expect(briefGaps("").length).toBeGreaterThan(5);
  });
});

const verdictBlock = (json: string) =>
  `chatter\n<verdict>\n${json}\n</verdict>\nmore chatter`;

describe("readVerdictTag", () => {
  test("reads a live verdict with its brief", () => {
    const verdict = readVerdictTag(
      verdictBlock(
        '{"standing":"live","evidence":"still throws","touches":["packages/core/src/test/request.ts"],"brief":"## Agent Brief"}',
      ),
    );

    expect(verdict?.standing).toBe("live");
    expect(verdict?.touches).toEqual(["packages/core/src/test/request.ts"]);
  });

  test("defaults the optional arrays so callers never branch on undefined", () => {
    const verdict = readVerdictTag(
      verdictBlock('{"standing":"already-resolved","evidence":"fixed in #1"}'),
    );

    expect(verdict?.touches).toEqual([]);
    expect(verdict?.questions).toEqual([]);
  });

  test("an unrecognised standing is not silently coerced to a shippable one", () => {
    expect(
      readVerdictTag(verdictBlock('{"standing":"maybe","evidence":"e"}')),
    ).toBeNull();
  });

  test("an absent block is null, which is not the same as a clean verdict", () => {
    expect(readVerdictTag("the agent rambled")).toBeNull();
  });

  test("malformed json is null", () => {
    expect(readVerdictTag(verdictBlock("{not json"))).toBeNull();
  });
});

describe("sharedPackages", () => {
  test("two issues touching the same package share it", () => {
    expect(
      sharedPackages(
        ["packages/core/src/route/a.ts", "packages/admin/src/b.ts"],
        ["packages/core/src/meta/c.ts"],
      ),
    ).toEqual(["packages/core"]);
  });

  test("issues in different packages share nothing", () => {
    expect(
      sharedPackages(["packages/core/src/a.ts"], ["packages/admin/src/b.ts"]),
    ).toEqual([]);
  });

  test("a plugin is its own package, not a sibling of every other plugin", () => {
    expect(
      sharedPackages(
        ["packages/plugins/media/src/a.ts"],
        ["packages/plugins/comments/src/b.ts"],
      ),
    ).toEqual([]);
  });

  test("a path outside packages/ never pairs two issues", () => {
    expect(sharedPackages(["docs/adr/0009.md"], ["docs/adr/0010.md"])).toEqual(
      [],
    );
  });
});

describe("briefWithColdReadNotes", () => {
  const BRIEF = "## Agent Brief\n\n**Out of scope:**\n- nothing";

  test("a cold read that found nothing leaves the brief byte-for-byte alone", () => {
    expect(briefWithColdReadNotes(BRIEF, [])).toBe(BRIEF);
  });

  test("a non-blocking finding reaches the implementer instead of being discarded", () => {
    const brief = briefWithColdReadNotes(BRIEF, [
      {
        severity: "medium",
        summary: "the suite is elsewhere",
        why: "it is under document-metaboxes",
      },
    ]);

    expect(brief).toContain("the suite is elsewhere");
    expect(brief).toContain("it is under document-metaboxes");
  });

  test("a blocking finding is not appended, because it never reaches a promotion", () => {
    expect(
      briefWithColdReadNotes(BRIEF, [
        { severity: "high", summary: "cannot tell", why: "w" },
      ]),
    ).toBe(BRIEF);
  });
});

describe("blockerEdges", () => {
  const core = (number: number) => ({
    number,
    touches: ["packages/core/src/route/a.ts"],
  });

  test("issues that share a package are chained, so ship never runs two at once", () => {
    expect(blockerEdges([core(30), core(10), core(20)])).toEqual([
      { ticket: 20, blockedBy: 10 },
      { ticket: 30, blockedBy: 20 },
    ]);
  });

  test("the chain is the same whichever order triage finished them in", () => {
    const shuffled = blockerEdges([core(20), core(30), core(10)]);

    expect(shuffled).toEqual(blockerEdges([core(10), core(20), core(30)]));
  });

  test("issues in different packages are left free to run in parallel", () => {
    expect(
      blockerEdges([
        { number: 10, touches: ["packages/core/src/a.ts"] },
        { number: 20, touches: ["packages/admin/src/b.ts"] },
      ]),
    ).toEqual([]);
  });

  test("an issue blocks on its nearest predecessor, not the oldest", () => {
    expect(blockerEdges([core(10), core(20), core(30)]).at(-1)).toEqual({
      ticket: 30,
      blockedBy: 20,
    });
  });

  test("one promotion needs no edge", () => {
    expect(blockerEdges([core(10)])).toEqual([]);
  });
});

describe("awaitingAnAnswer", () => {
  const said = (author: string, body: string) => ({ author, body });
  const notes = said(
    "nasyrov",
    "> *This was generated by AI during triage.*\n\n## Triage Notes\n\n- a question",
  );

  test("triage notes as the last word means nobody has replied yet", () => {
    expect(awaitingAnAnswer([said("nasyrov", "the report"), notes])).toBe(true);
  });

  test("a reply after the notes reopens the issue to triage", () => {
    expect(awaitingAnAnswer([notes, said("nasyrov", "option 2, go")])).toBe(
      false,
    );
  });

  test("a workflow's auto-reply is not an answer", () => {
    expect(
      awaitingAnAnswer([
        notes,
        said("github-actions", "Thanks for the report! Please reply with..."),
      ]),
    ).toBe(true);
  });

  test("triage talking to itself is not an answer either", () => {
    expect(
      awaitingAnAnswer([
        notes,
        said("nasyrov", "> *This was generated by AI during triage.*\n\nmore"),
      ]),
    ).toBe(true);
  });

  test("a person answering after a bot's noise still counts", () => {
    expect(
      awaitingAnAnswer([
        notes,
        said("github-actions", "Thanks for the report!"),
        said("nasyrov", "go with option 2"),
      ]),
    ).toBe(false);
  });

  test("an issue nobody has triaged is not awaiting anything", () => {
    expect(awaitingAnAnswer([])).toBe(false);
  });

  test("a promoted brief is not a question, so it does not park the issue", () => {
    expect(
      awaitingAnAnswer([
        said(
          "nasyrov",
          "> *This was generated by AI during triage.*\n\n## Agent Brief",
        ),
      ]),
    ).toBe(false);
  });
});
