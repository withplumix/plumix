import { describe, expect, test } from "vitest";

import { amendedBrief, amendedBriefIn, readDecisionTag } from "./decide.js";

const tagged = (decision: unknown) =>
  `thinking…\n<decision>\n${JSON.stringify(decision)}\n</decision>`;

describe("readDecisionTag", () => {
  test("reads a decision with the edits to make to the brief", () => {
    const decision = readDecisionTag(
      tagged({
        decidable: true,
        why: "ADR 0044 runs migrations without the config",
        edits: [{ old: "the migration fails", new: "plumix migrate fails" }],
        comment: "Decided by the ship loop: the check moves to plumix migrate.",
      }),
    );

    expect(decision?.decidable).toBe(true);
    expect(decision?.edits).toHaveLength(1);
  });

  test("a decision the documents do not settle carries no edits", () => {
    const decision = readDecisionTag(
      tagged({ decidable: false, why: "needs a product call" }),
    );

    expect(decision).toMatchObject({ decidable: false, edits: [] });
  });

  test("no readable block is no decision", () => {
    expect(readDecisionTag("I could not decide")).toBeNull();
  });
});

describe("amendedBrief", () => {
  test("applies each edit to the brief", () => {
    expect(
      amendedBrief("one two three", [
        { old: "one", new: "1" },
        { old: "three", new: "3" },
      ]),
    ).toBe("1 two 3");
  });

  test("refuses an edit whose text is not in the brief, so a guess never lands", () => {
    expect(amendedBrief("one two", [{ old: "four", new: "4" }])).toBeNull();
  });

  test("refuses an edit whose text appears twice, since it could change the wrong one", () => {
    expect(amendedBrief("one one", [{ old: "one", new: "1" }])).toBeNull();
  });

  test("refuses a decision that changes nothing", () => {
    expect(amendedBrief("one", [])).toBeNull();
  });
});

describe("amendedBriefIn", () => {
  const body = { where: "body" as const, text: "the original brief" };
  const triage = {
    where: 7,
    text: "## Agent Brief\nwrite render-template.test.tsx",
  };
  const rewrite = {
    where: 9,
    text: "## Agent Brief\nreplaces it: write render-template.test.tsx",
  };

  test("amends the comment that holds the brief when the body does not", () => {
    expect(
      amendedBriefIn(
        [body, triage],
        [
          {
            old: "write render-template.test.tsx",
            new: "write a feature test",
          },
        ],
      ),
    ).toEqual({ where: 7, text: "## Agent Brief\nwrite a feature test" });
  });

  test("the latest text that holds every edit wins, as the latest brief does", () => {
    expect(
      amendedBriefIn(
        [body, triage, rewrite],
        [{ old: "render-template.test.tsx", new: "a feature test" }],
      ),
    ).toEqual({
      where: 9,
      text: "## Agent Brief\nreplaces it: write a feature test",
    });
  });

  test("refuses edits no single text holds", () => {
    expect(
      amendedBriefIn(
        [body, triage],
        [
          { old: "the original brief", new: "x" },
          { old: "## Agent Brief", new: "y" },
        ],
      ),
    ).toBeNull();
  });
});
