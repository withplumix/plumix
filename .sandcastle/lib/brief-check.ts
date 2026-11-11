import { join } from "node:path";
import { z } from "zod";

import type { RunAgentPhase, Thinker } from "./agent.js";
import type { Ticket } from "./github.js";
import {
  parsedJsonOrNull,
  PROMPT_DIR,
  readOrAskAgain,
  taggedBlock,
} from "./agent.js";
import { say } from "./log.js";
import { MERGE_BASE } from "./repo.js";
import { HALF_AN_HOUR_IN_SECONDS } from "./sandbox.js";

const BRIEF_CHECKER: Thinker = { model: "claude-sonnet-5-5", effort: "medium" };

const briefCheckSchema = z.object({
  ok: z.boolean(),
  falsePremises: z
    .array(
      z.object({
        claim: z.string(),
        evidence: z.string(),
        why: z.string().default(""),
      }),
    )
    .default([]),
  acceptance: z.array(z.string()).optional(),
  plan: z.array(z.string()).optional(),
  evidence: z.array(z.string()).optional(),
  questions: z.array(z.string()).optional(),
});

type BriefCheck = z.infer<typeof briefCheckSchema>;

export const readBriefCheckTag = (stdout: string): BriefCheck | null => {
  const block = taggedBlock(stdout, "brief-check");
  if (!block) return null;
  const parsed = briefCheckSchema.safeParse(parsedJsonOrNull(block));
  return parsed.success ? parsed.data : null;
};

const EMIT_THE_BRIEF_CHECK =
  "End with <brief-check> JSON: ok, falsePremises, acceptance, plan, evidence, questions. A ready handoff has nonempty acceptance, plan and evidence arrays.";

type AfterBriefCheck =
  | { readonly next: "implement"; readonly brief?: string }
  | { readonly next: "park"; readonly reason: string };

const asPremiseList = (premises: BriefCheck["falsePremises"]): string =>
  premises
    .map(
      ({ claim, evidence, why }, index) =>
        `${index + 1}. ${evidence} — ${claim}\n   ${why}`,
    )
    .join("\n\n");

export const checkBrief = async (
  runAgentPhase: RunAgentPhase,
  ticket: Ticket,
  tell: (line: string) => void = say,
): Promise<AfterBriefCheck> => {
  const checked = await runAgentPhase("check-brief", BRIEF_CHECKER, {
    promptFile: join(PROMPT_DIR, "check-brief.md"),
    promptArgs: { TICKET: String(ticket.number), BASE: MERGE_BASE },
    maxIterations: 1,
    idleTimeoutSeconds: HALF_AN_HOUR_IN_SECONDS,
  });
  const check = await readOrAskAgain(
    runAgentPhase,
    "check-brief",
    BRIEF_CHECKER,
    checked,
    readBriefCheckTag,
    EMIT_THE_BRIEF_CHECK,
  );
  if (!check) {
    const reason =
      "Analysis ended without a readable brief; implementation was not started";
    tell(`  ${reason}`);
    return { next: "park", reason };
  }
  const premises = check.falsePremises;
  if (check.questions?.length)
    return {
      next: "park",
      reason: `Analysis needs a decision:\n${check.questions.join("\n")}`,
    };
  if (premises.length === 0)
    return check.ok &&
      check.acceptance?.length &&
      check.plan?.length &&
      check.evidence?.length
      ? { next: "implement", brief: JSON.stringify(check, null, 2) }
      : {
          next: "park",
          reason:
            "Analysis must provide acceptance criteria, a plan and repository evidence",
        };
  return {
    next: "park",
    reason: `${premises.length} premise(s) in the brief are false, so it needs a person before it is implemented:\n\n${asPremiseList(premises)}`,
  };
};
