import { describe, expect, test } from "vitest";

import type { RunAgentPhase } from "./agent.js";
import { checkBrief, readBriefCheckTag } from "./brief-check.js";

const TICKET = { number: 3018, title: "rate-limit the magic-link endpoint" };

const ranWith = (stdout: string) =>
  ({
    stdout,
    iterations: [{ sessionId: "s" }],
    commits: [],
  }) as unknown as Awaited<ReturnType<RunAgentPhase>>;

const briefCheckBlock = (check: unknown) =>
  `I read the ticket.\n<brief-check>\n${JSON.stringify(check)}\n</brief-check>`;

const ratelimit = {
  claim: "reuse the existing rate-limit primitive",
  evidence: "docs/adr/0041-a-sign-in-method-is-a-registered-extension.md:46",
  why: "no such primitive exists and ADR 0041 forbids adding one",
};

describe("readBriefCheckTag", () => {
  test("reads each false premise with its evidence and why it matters", () => {
    expect(
      readBriefCheckTag(
        briefCheckBlock({ ok: false, falsePremises: [ratelimit] }),
      ),
    ).toEqual({ ok: false, falsePremises: [ratelimit] });
  });
});

describe("checkBrief", () => {
  test("analysis hands evidence, criteria and a plan to the implementer", async () => {
    const brief = {
      ok: true,
      falsePremises: [],
      acceptance: ["reject an expired link"],
      plan: ["add a red endpoint test"],
      evidence: ["packages/core/src/auth.ts:10"],
      questions: [],
    };
    const next = await checkBrief(
      async () => ranWith(briefCheckBlock(brief)),
      TICKET,
    );
    expect(next).toEqual({
      next: "implement",
      brief: JSON.stringify(brief, null, 2),
    });
  });
  test("a brief resting on a false premise is parked before implementation, naming each one", async () => {
    const mailer = {
      claim: "log the transport used",
      evidence: "packages/core/src/mailer/types.ts:8",
      why: "a Mailer has no name to log",
    };

    const next = await checkBrief(
      async () =>
        ranWith(
          briefCheckBlock({ ok: false, falsePremises: [ratelimit, mailer] }),
        ),
      TICKET,
    );

    expect(next).toEqual({
      next: "park",
      reason:
        "2 premise(s) in the brief are false, so it needs a person before it is implemented:\n\n" +
        "1. docs/adr/0041-a-sign-in-method-is-a-registered-extension.md:46 — reuse the existing rate-limit primitive\n" +
        "   no such primitive exists and ADR 0041 forbids adding one\n\n" +
        "2. packages/core/src/mailer/types.ts:8 — log the transport used\n" +
        "   a Mailer has no name to log",
    });
  });

  test("analysis without a plan and evidence stops before implementation", async () => {
    const next = await checkBrief(
      async () => ranWith(briefCheckBlock({ ok: true, falsePremises: [] })),
      TICKET,
    );

    expect(next).toEqual({
      next: "park",
      reason:
        "Analysis must provide acceptance criteria, a plan and repository evidence",
    });
  });

  test("an empty analysis is not ready", async () => {
    const next = await checkBrief(
      async () => ranWith(briefCheckBlock({ ok: false, falsePremises: [] })),
      TICKET,
    );

    expect(next).toEqual({
      next: "park",
      reason:
        "Analysis must provide acceptance criteria, a plan and repository evidence",
    });
  });

  test("unreadable analysis stops before implementation", async () => {
    const phases: string[] = [];
    const said: string[] = [];

    const next = await checkBrief(
      async (phase) => {
        phases.push(phase);
        return ranWith("the brief looks fine to me");
      },
      TICKET,
      (line) => said.push(line),
    );

    expect(next).toEqual({
      next: "park",
      reason:
        "Analysis ended without a readable brief; implementation was not started",
    });
    expect(phases).toEqual([
      "check-brief",
      "check-brief:ask-again1",
      "check-brief:ask-again2",
    ]);
    expect(said).toEqual([
      "  Analysis ended without a readable brief; implementation was not started",
    ]);
  });

  test("runs as its own phase on a cheap thinker, handed the ticket and main", async () => {
    const ran: unknown[] = [];

    await checkBrief(async (phase, thinker, options) => {
      ran.push({ phase, thinker, promptArgs: options.promptArgs });
      return ranWith(briefCheckBlock({ ok: true, falsePremises: [] }));
    }, TICKET);

    expect(ran).toEqual([
      {
        phase: "check-brief",
        thinker: { model: "claude-sonnet-5-5", effort: "medium" },
        promptArgs: { TICKET: "3018", BASE: "origin/main" },
      },
    ]);
  });
});
