import { join } from "node:path";
import { z } from "zod";

import type { Thinker } from "./agent.js";
import type { Ticket } from "./github.js";
import type { Journal } from "./telemetry.js";
import {
  agentPhaseRunner,
  parsedJsonOrNull,
  PROMPT_DIR,
  readOrAskAgain,
  taggedBlock,
} from "./agent.js";
import { amendIssue, issueBody, resetBranchToMain } from "./github.js";
import { say } from "./log.js";
import {
  closePlumixSandbox,
  createUnbuiltSandbox,
  HALF_AN_HOUR_IN_SECONDS,
} from "./sandbox.js";

/**
 * A park over a choice the spec, its ADRs and VISION.md already settle is
 * decided here instead of waiting on a person: overnight, one park at the
 * root of a chain idles everything behind it.
 */
const DECIDER: Thinker = { model: "claude-opus-5-5", effort: "high" };

const decisionSchema = z.object({
  decidable: z.boolean(),
  why: z.string().default(""),
  edits: z
    .array(z.object({ old: z.string().min(1), new: z.string() }))
    .default([]),
  comment: z.string().default(""),
});

export type Decision = z.infer<typeof decisionSchema>;

export const readDecisionTag = (stdout: string): Decision | null => {
  const block = taggedBlock(stdout, "decision");
  if (!block) return null;
  const parsed = decisionSchema.safeParse(parsedJsonOrNull(block));
  return parsed.success ? parsed.data : null;
};

/** Null unless every edit's text appears exactly once, so a guessed edit never lands. */
export const amendedBrief = (
  body: string,
  edits: Decision["edits"],
): string | null => {
  if (edits.length === 0) return null;
  let amended = body;
  for (const edit of edits) {
    if (amended.split(edit.old).length !== 2) return null;
    amended = amended.replace(edit.old, () => edit.new);
  }
  return amended;
};

const EMIT_THE_DECISION =
  "End with the <decision> block the prompt describes: decidable, why, edits and comment, as JSON.";

/** True when the brief was amended and the ticket can be taken again. */
export const decideWhatTheDocsSettle = async (
  ticket: Ticket,
  reason: string,
  journal: Journal,
): Promise<boolean> => {
  const branch = `chore/decide-${ticket.number}`;
  journal.setTicket(ticket, branch);
  say(`\n--- decide #${ticket.number} ---`);
  resetBranchToMain(branch);
  const sandbox = await createUnbuiltSandbox(branch);
  const runAgentPhase = agentPhaseRunner(sandbox, journal);
  try {
    const decided = await runAgentPhase("decide", DECIDER, {
      promptFile: join(PROMPT_DIR, "decide.md"),
      promptArgs: { TICKET: String(ticket.number), REASON: reason },
      maxIterations: 1,
      idleTimeoutSeconds: HALF_AN_HOUR_IN_SECONDS,
    });
    const decision = await readOrAskAgain(
      runAgentPhase,
      "decide",
      DECIDER,
      decided,
      readDecisionTag,
      EMIT_THE_DECISION,
    );
    if (!decision?.decidable) {
      say(
        `  #${ticket.number} needs a person: ${decision?.why || "the decider gave no readable decision"}`,
      );
      return false;
    }
    const amended = amendedBrief(issueBody(ticket.number), decision.edits);
    if (!amended) {
      say(
        `  #${ticket.number} needs a person: the decider's edits do not match the brief`,
      );
      return false;
    }
    amendIssue(ticket.number, amended, decision.comment);
    say(`  #${ticket.number} decided: ${decision.why}`);
    return true;
  } finally {
    await closePlumixSandbox(sandbox);
  }
};
