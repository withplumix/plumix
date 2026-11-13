import { join } from "node:path";
import { z } from "zod";

import type { RunAgentPhase, Thinker } from "./agent.js";
import type { Ticket } from "./github.js";
import type { Replan } from "./ship-history.js";
import {
  FIVE_MINUTES_IN_SECONDS,
  parsedJsonOrNull,
  PROMPT_DIR,
  readOrAskAgain,
  taggedBlock,
} from "./agent.js";
import { missingCitedPaths } from "./handoff.js";
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
  waitingOn: z.array(z.number().int().positive()).optional(),
  protectedPaths: z.array(z.string()).optional(),
});

type BriefCheck = z.infer<typeof briefCheckSchema>;

export const readBriefCheckTag = (stdout: string): BriefCheck | null => {
  const block = taggedBlock(stdout, "brief-check");
  if (!block) return null;
  const parsed = briefCheckSchema.safeParse(parsedJsonOrNull(block));
  return parsed.success ? parsed.data : null;
};

const EMIT_THE_BRIEF_CHECK =
  "End with <brief-check> JSON: ok, falsePremises, acceptance, plan, evidence, questions, waitingOn. Each false premise is an object with claim, evidence and why, not a string. A ready handoff has nonempty acceptance, plan and evidence arrays.";

type AfterBriefCheck =
  | { readonly next: "implement"; readonly brief?: string }
  | { readonly next: "park"; readonly reason: string }
  | { readonly next: "wait"; readonly on: readonly number[] };

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
  {
    exists,
    isOpen,
    context,
    tell = say,
  }: {
    readonly exists: (path: string) => Promise<boolean>;
    /** Whether an issue or pull request is still open on GitHub. */
    readonly isOpen: (issue: number) => Promise<boolean>;
    /** What the analyst starts from: a fresh branch, earlier work, earlier stops. */
    readonly context: string;
    readonly tell?: (line: string) => void;
  },
): Promise<AfterBriefCheck> => {
  const checked = await runAgentPhase("check-brief", BRIEF_CHECKER, {
    promptFile: join(PROMPT_DIR, "check-brief.md"),
    promptArgs: {
      TICKET: String(ticket.number),
      BASE: MERGE_BASE,
      CONTEXT: context,
    },
    maxIterations: 1,
    idleTimeoutSeconds: HALF_AN_HOUR_IN_SECONDS,
  });
  let check = await readOrAskAgain(
    runAgentPhase,
    "check-brief",
    BRIEF_CHECKER,
    checked,
    readBriefCheckTag,
    EMIT_THE_BRIEF_CHECK,
  );
  const missing = check
    ? await missingCitedPaths(check.evidence ?? [], exists)
    : [];
  const session = checked.iterations.at(-1)?.sessionId;
  if (missing.length > 0 && session) {
    const corrected = await runAgentPhase(
      "check-brief:cited-paths",
      BRIEF_CHECKER,
      {
        prompt: `Your evidence cites files this repository does not have: ${missing.join(", ")}. Find what the brief or your evidence meant, or report the brief's claim as a false premise. Change no file and make no commit.\n\n${EMIT_THE_BRIEF_CHECK}`,
        resumeSession: session,
        maxIterations: 1,
        idleTimeoutSeconds: FIVE_MINUTES_IN_SECONDS,
      },
    );
    check = readBriefCheckTag(corrected.stdout);
  }
  const stillMissing = check
    ? await missingCitedPaths(check.evidence ?? [], exists)
    : [];
  if (stillMissing.length > 0)
    return {
      next: "park",
      reason: `Analysis cites files the repository does not have: ${stillMissing.join(", ")}`,
    };
  if (!check) {
    const reason =
      "Analysis ended without a readable brief; implementation was not started";
    tell(`  ${reason}`);
    return { next: "park", reason };
  }
  const open: number[] = [];
  for (const issue of check.waitingOn ?? [])
    if (await isOpen(issue)) open.push(issue);
  if (open.length > 0) return { next: "wait", on: open };
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

/** Tells the analyst what it is planning on top of, so the loop's own state is never a question for a person. */
export const planningContext = (
  commits: readonly string[],
  replans: readonly Replan[],
): string => {
  const work = commits.length
    ? `This branch already carries work from an earlier attempt at this ticket:\n\n${commits.join("\n")}\n\nThe implementer continues on it. Plan the remaining work from there and judge what is there against the brief; whether to keep it is not a question.`
    : "A fresh delivery: the branch carries no commits beyond main.";
  if (!replans.length) return work;
  const stops = replans
    .map(
      ({ reason, decision }, index) =>
        `${index + 1}. Stopped: ${reason}\n   Decided: ${decision}`,
    )
    .join("\n\n");
  return `${work}\n\nThe ticket stopped before and went back for clearer instructions. The brief was amended to match each decision; build on them and do not reopen them:\n\n${stops}`;
};
