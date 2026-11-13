import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { RunAgentPhase } from "./agent.js";
import { PROMPT_DIR } from "./agent.js";
import {
  checkBrief,
  planningContext,
  readBriefCheckTag,
} from "./brief-check.js";

const TICKET = { number: 3018, title: "rate-limit the magic-link endpoint" };

const ranWith = (stdout: string) =>
  ({
    stdout,
    iterations: [{ sessionId: "s" }],
    commits: [],
  }) as unknown as Awaited<ReturnType<RunAgentPhase>>;

const briefCheckBlock = (check: unknown) =>
  `I read the ticket.\n<brief-check>\n${JSON.stringify(check)}\n</brief-check>`;

const everyFileExists = async () => true;
const FRESH = "A fresh delivery.";
const nothingOpen = async () => false;

const ready = {
  ok: true,
  falsePremises: [],
  acceptance: ["reject an expired link"],
  plan: ["add a red endpoint test"],
  evidence: ["packages/core/src/auth.ts:10 checks the expiry"],
  questions: [],
};

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

  test("the prompt's example shows a false premise in the shape the harness reads", () => {
    const example = readBriefCheckTag(
      readFileSync(join(PROMPT_DIR, "check-brief.md"), "utf8"),
    );

    expect(example?.falsePremises).toEqual([
      expect.objectContaining({
        claim: expect.any(String),
        evidence: expect.any(String),
        why: expect.any(String),
      }),
    ]);
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
      { exists: everyFileExists, isOpen: nothingOpen, context: FRESH },
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
      { exists: everyFileExists, isOpen: nothingOpen, context: FRESH },
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
      { exists: everyFileExists, isOpen: nothingOpen, context: FRESH },
    );

    expect(next).toEqual({
      next: "park",
      reason:
        "Analysis must provide acceptance criteria, a plan and repository evidence",
    });
  });

  const readyHandoff = {
    ok: true,
    falsePremises: [],
    acceptance: ["lint reports a plugin writing a core table"],
    plan: ["red: a rule test"],
    evidence: ["packages/plugins/menu/src/rpc.ts:32 writes terms"],
  };

  test("a ticket whose dependency is still open waits for it rather than going to a person", async () => {
    const next = await checkBrief(
      async () =>
        ranWith(
          briefCheckBlock({
            ...readyHandoff,
            questions: ["Merge #3261 first?"],
            waitingOn: [3261, 3256],
          }),
        ),
      TICKET,
      {
        exists: everyFileExists,
        isOpen: async (issue) => issue === 3261,
        context: FRESH,
      },
    );

    expect(next).toEqual({ next: "wait", on: [3261] });
  });

  test("a dependency the analyst names that has since closed does not hold the ticket", async () => {
    const next = await checkBrief(
      async () =>
        ranWith(briefCheckBlock({ ...readyHandoff, waitingOn: [3256] })),
      TICKET,
      { exists: everyFileExists, isOpen: nothingOpen, context: FRESH },
    );

    expect(next.next).toBe("implement");
  });

  test("an empty analysis is not ready", async () => {
    const next = await checkBrief(
      async () => ranWith(briefCheckBlock({ ok: false, falsePremises: [] })),
      TICKET,
      { exists: everyFileExists, isOpen: nothingOpen, context: FRESH },
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
      {
        exists: everyFileExists,
        isOpen: nothingOpen,
        context: FRESH,
        tell: (line) => said.push(line),
      },
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

    await checkBrief(
      async (phase, thinker, options) => {
        ran.push({ phase, thinker, promptArgs: options.promptArgs });
        return ranWith(briefCheckBlock({ ok: true, falsePremises: [] }));
      },
      TICKET,
      { exists: everyFileExists, isOpen: nothingOpen, context: FRESH },
    );

    expect(ran).toEqual([
      {
        phase: "check-brief",
        thinker: { model: "claude-sonnet-5-5", effort: "medium" },
        promptArgs: { TICKET: "3018", BASE: "origin/main", CONTEXT: FRESH },
      },
    ]);
  });

  test("a ready brief citing a file the repository lacks goes back to the analyst, naming it", async () => {
    const asked: { phase: string; prompt?: string; resumeSession?: string }[] =
      [];
    const cited = {
      ...ready,
      evidence: ["packages/core/src/render-template.test.tsx:520 head shape"],
    };

    const next = await checkBrief(
      async (phase, _thinker, options) => {
        asked.push({
          phase,
          prompt: options.prompt,
          resumeSession: options.resumeSession,
        });
        return ranWith(
          briefCheckBlock(phase === "check-brief" ? cited : ready),
        );
      },
      TICKET,
      {
        exists: async (path) => path === "packages/core/src/auth.ts",
        isOpen: nothingOpen,
        context: FRESH,
      },
    );

    expect(asked.map(({ phase }) => phase)).toEqual([
      "check-brief",
      "check-brief:cited-paths",
    ]);
    expect(asked[1]?.prompt).toContain(
      "packages/core/src/render-template.test.tsx",
    );
    expect(asked[1]?.resumeSession).toBe("s");
    expect(next).toEqual({
      next: "implement",
      brief: JSON.stringify(ready, null, 2),
    });
  });

  test("a brief that still cites missing files is parked, naming them", async () => {
    const cited = {
      ...ready,
      evidence: ["packages/core/src/gone.ts:1 does the thing"],
    };

    const next = await checkBrief(
      async () => ranWith(briefCheckBlock(cited)),
      TICKET,
      { exists: async () => false, isOpen: nothingOpen, context: FRESH },
    );

    expect(next).toEqual({
      next: "park",
      reason:
        "Analysis cites files the repository does not have: packages/core/src/gone.ts",
    });
  });

  test("protected paths reach the implementer as constraints, not as questions", async () => {
    const guarded = { ...ready, protectedPaths: ["packages/core/migrations/"] };

    const next = await checkBrief(
      async () => ranWith(briefCheckBlock(guarded)),
      TICKET,
      { exists: everyFileExists, isOpen: nothingOpen, context: FRESH },
    );

    expect(next).toEqual({
      next: "implement",
      brief: JSON.stringify(guarded, null, 2),
    });
  });
});

describe("planningContext", () => {
  test("a fresh delivery says so", () => {
    expect(planningContext([], [])).toMatch(/^A fresh delivery/);
  });

  test("work already on the branch is the starting point, not a question", () => {
    const context = planningContext(
      ["09f27e096 feat(core): export DocumentManifestError"],
      [],
    );

    expect(context).toContain(
      "09f27e096 feat(core): export DocumentManifestError",
    );
    expect(context).toMatch(/continues on it/);
    expect(context).toMatch(/not a question/);
  });

  test("every earlier stop and its decision reach the analyst, so it builds on them", () => {
    const context = planningContext(
      [],
      [
        { reason: "which docs page?", decision: "overview.mdx" },
        {
          reason: "throw or log?",
          decision: "log, as events-and-filters.md says",
        },
      ],
    );

    expect(context).toContain(
      "1. Stopped: which docs page?\n   Decided: overview.mdx",
    );
    expect(context).toContain("2. Stopped: throw or log?");
    expect(context).toMatch(/do not reopen/);
  });
});
