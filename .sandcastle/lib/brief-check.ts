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
});

type BriefCheck = z.infer<typeof briefCheckSchema>;

export const readBriefCheckTag = (stdout: string): BriefCheck | null => {
  const block = taggedBlock(stdout, "brief-check");
  if (!block) return null;
  const parsed = briefCheckSchema.safeParse(parsedJsonOrNull(block));
  return parsed.success ? parsed.data : null;
};

const EMIT_THE_BRIEF_CHECK =
  "End with the <brief-check> block the prompt describes: ok and falsePremises, as JSON.";

type AfterBriefCheck =
  | { readonly next: "implement" }
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
    tell(
      "  check-brief ended without a readable <brief-check> block; implementing the brief as written",
    );
    return { next: "implement" };
  }
  const premises = check.falsePremises;
  if (check.ok || premises.length === 0) return { next: "implement" };
  return {
    next: "park",
    reason: `${premises.length} premise(s) in the brief are false, so it needs a person before it is implemented:\n\n${asPremiseList(premises)}`,
  };
};
