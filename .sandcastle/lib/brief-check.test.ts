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

  test("a brief whose premises hold goes on to implementation", async () => {
    const next = await checkBrief(
      async () => ranWith(briefCheckBlock({ ok: true, falsePremises: [] })),
      TICKET,
    );

    expect(next).toEqual({ next: "implement" });
  });

  test("a check that says not ok but names no false premise has nothing to park on", async () => {
    const next = await checkBrief(
      async () => ranWith(briefCheckBlock({ ok: false, falsePremises: [] })),
      TICKET,
    );

    expect(next).toEqual({ next: "implement" });
  });

  test("a check the harness still cannot read after asking again lets implementation go ahead, and says so", async () => {
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

    expect(next).toEqual({ next: "implement" });
    expect(phases).toEqual([
      "check-brief",
      "check-brief:ask-again1",
      "check-brief:ask-again2",
    ]);
    expect(said).toEqual([
      "  check-brief ended without a readable <brief-check> block; implementing the brief as written",
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
