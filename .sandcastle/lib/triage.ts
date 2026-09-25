import { join } from "node:path";
import { z } from "zod";

import type { RunAgentPhase } from "./agent.js";
import type { Executor } from "./gates.js";
import type { IssueComment, TriageCandidate } from "./github.js";
import type { Journal } from "./telemetry.js";
import { parsedJsonOrNull, PROMPT_DIR, taggedBlock } from "./agent.js";
import { TRIAGE_DISCLAIMER, TRIAGE_NOTES_HEADING } from "./github.js";
import { say } from "./log.js";
import { readFindingsTag } from "./ticket.js";

const ASSESS_MODEL = "claude-opus-5-5";
const COLD_READER_MODEL = "claude-sonnet-5";
const BLOCKING_SEVERITY = "high";
const HALF_AN_HOUR_IN_SECONDS = 1_800;
const ITERATIONS_ALLOWED_FOR_A_READ_ONLY_PHASE = 3;

export type IssueShape = "specified" | "unspecified" | "open-decision";

const BRIEF_SECTIONS = [
  "Category",
  "Summary",
  "Current behavior",
  "Desired behavior",
  "Key interfaces",
  "Acceptance criteria",
  "Out of scope",
] as const;

const DEFERRED_DIRECTION =
  /to be grilled|not assumed|unset until|direction is chosen|do we want|which do you/i;

const sectionBody = (body: string, heading: RegExp): string | null => {
  const start = body.match(new RegExp(`^##\\s*${heading.source}.*$`, "im"));
  if (start?.index === undefined) return null;
  const rest = body.slice(start.index + start[0].length);
  const next = rest.match(/^##\s/m);
  return (next?.index === undefined ? rest : rest.slice(0, next.index)).trim();
};

const countsBullets = (section: string): number =>
  section.match(/^\s*[-*]\s+/gm)?.length ?? 0;

const enumeratesOptions = (section: string): boolean =>
  (section.match(/^\s*\d\.\s+/gm)?.length ?? 0) > 1;

export const classifyIssueBody = (body: string): IssueShape => {
  const direction = sectionBody(body, /Direction/);
  const decision = sectionBody(body, /Decision for triage/);
  if (
    decision !== null ||
    DEFERRED_DIRECTION.test(body) ||
    (direction !== null && enumeratesOptions(direction))
  ) {
    return "open-decision";
  }

  const acceptance = sectionBody(body, /Acceptance/);
  if (acceptance === null) return "unspecified";

  const criteria = countsBullets(acceptance);
  return criteria >= 1 && (direction !== null || criteria >= 2)
    ? "specified"
    : "unspecified";
};

export const briefGaps = (brief: string): readonly string[] => {
  const missing = BRIEF_SECTIONS.filter(
    (section) => !brief.includes(`**${section}:**`),
  );
  const hasChecklist = /^\s*-\s*\[ \]\s+\S/m.test(brief);
  return hasChecklist || missing.includes("Acceptance criteria")
    ? missing
    : [...missing, "Acceptance criteria"];
};

const verdictSchema = z.object({
  standing: z.enum(["live", "already-resolved", "needs-decision"]),
  evidence: z.string(),
  touches: z.array(z.string()).default([]),
  brief: z.string().default(""),
  questions: z.array(z.string()).default([]),
});

export type Verdict = z.infer<typeof verdictSchema>;

export const readVerdictTag = (stdout: string): Verdict | null => {
  const block = taggedBlock(stdout, "verdict");
  if (!block) return null;
  const parsed = verdictSchema.safeParse(parsedJsonOrNull(block));
  return parsed.success ? parsed.data : null;
};

const packageOf = (path: string): string | null =>
  path.match(/^(packages\/(?:plugins\/|runtimes\/)?[^/]+)\//)?.[1] ?? null;

export const sharedPackages = (
  a: readonly string[],
  b: readonly string[],
): readonly string[] => {
  const inB = new Set(b.flatMap((path) => packageOf(path) ?? []));
  return [...new Set(a.flatMap((path) => packageOf(path) ?? []))].filter(
    (name) => inB.has(name),
  );
};

export interface PromotedIssue {
  readonly number: number;
  readonly touches: readonly string[];
}

export const blockerEdges = (
  promoted: readonly PromotedIssue[],
): readonly { readonly ticket: number; readonly blockedBy: number }[] => {
  const oldestFirst = [...promoted].sort((a, b) => a.number - b.number);
  return oldestFirst.flatMap((issue, index) => {
    const runsIntoTheSamePackage = oldestFirst
      .slice(0, index)
      .filter(
        ({ touches }) => sharedPackages(touches, issue.touches).length > 0,
      )
      .at(-1);
    return runsIntoTheSamePackage
      ? [{ ticket: issue.number, blockedBy: runsIntoTheSamePackage.number }]
      : [];
  });
};

export type TriageOutcome =
  | {
      readonly status: "promoted";
      readonly brief: string;
      readonly touches: readonly string[];
    }
  | { readonly status: "closed"; readonly evidence: string }
  | { readonly status: "questioned"; readonly questions: readonly string[] }
  | { readonly status: "skipped"; readonly reason: string };

const PATH_SAFE = /^[\w./-]+$/;

const pathsPresentInRepo = async (
  sandbox: Executor,
  paths: readonly string[],
): Promise<readonly string[]> => {
  const checked = await Promise.all(
    paths
      .filter((path) => PATH_SAFE.test(path))
      .map(async (path) => {
        const { exitCode } = await sandbox.exec(`test -e ${path}`);
        return exitCode === 0 ? path : null;
      }),
  );
  return checked.flatMap((path) => path ?? []);
};

export const briefWithColdReadNotes = (
  brief: string,
  findings: readonly { severity: string; summary: string; why?: string }[],
): string => {
  const notes = findings.filter(
    ({ severity }) => severity !== BLOCKING_SEVERITY,
  );
  if (notes.length === 0) return brief;
  const lines = notes
    .map(({ summary, why }) => `- ${summary}${why ? `\n  ${why}` : ""}`)
    .join("\n");
  return `${brief}\n\n**What slowed a cold reader down:**\n\n${lines}`;
};

const askedInstead = (
  questions: readonly string[],
  fallback: string,
): TriageOutcome => ({
  status: "questioned",
  questions: questions.length > 0 ? questions : [fallback],
});

export interface TriageModels {
  readonly assess: string;
  readonly coldReader: string;
}

export const DEFAULT_TRIAGE_MODELS: TriageModels = {
  assess: ASSESS_MODEL,
  coldReader: COLD_READER_MODEL,
};

export const triageIssue = async (
  issue: TriageCandidate,
  runAgentPhase: RunAgentPhase,
  sandbox: Executor,
  journal: Journal,
  models: TriageModels,
): Promise<TriageOutcome> => {
  const assessed = await runAgentPhase("assess", models.assess, {
    promptFile: join(PROMPT_DIR, "triage-assess.md"),
    promptArgs: { ISSUE: String(issue.number) },
    maxIterations: ITERATIONS_ALLOWED_FOR_A_READ_ONLY_PHASE,
    idleTimeoutSeconds: HALF_AN_HOUR_IN_SECONDS,
  });

  const verdict = readVerdictTag(assessed.stdout);
  if (!verdict) {
    return { status: "skipped", reason: "no parseable <verdict> block" };
  }

  if (verdict.standing === "needs-decision") {
    return askedInstead(
      verdict.questions,
      "Triage could not settle the direction, but named no question.",
    );
  }

  if (verdict.standing === "already-resolved") {
    const present = await pathsPresentInRepo(sandbox, verdict.touches);
    if (present.length === 0) {
      return {
        status: "skipped",
        reason: `claimed already-resolved but cited no path that exists: ${verdict.touches.join(", ") || "none cited"}`,
      };
    }
    return { status: "closed", evidence: verdict.evidence };
  }

  const gaps = briefGaps(verdict.brief);
  if (gaps.length > 0) {
    say(`  brief is missing: ${gaps.join(", ")}`);
    return askedInstead(
      verdict.questions,
      `The brief triage drafted is missing: ${gaps.join(", ")}.`,
    );
  }

  const cold = await runAgentPhase("cold-read", models.coldReader, {
    promptFile: join(PROMPT_DIR, "review-brief.md"),
    promptArgs: { BRIEF: verdict.brief },
    maxIterations: ITERATIONS_ALLOWED_FOR_A_READ_ONLY_PHASE,
    idleTimeoutSeconds: HALF_AN_HOUR_IN_SECONDS,
  });

  const review = readFindingsTag(cold.stdout);
  journal.record({
    phase: "cold-read:findings",
    kind: "review",
    model: models.coldReader,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    outcome: review.emittedParseableFindings ? "ok" : "fail",
    detail: review.emittedParseableFindings
      ? undefined
      : "no parseable <findings> block",
    findings: {
      total: review.findings.length,
      high: review.findings.filter(({ severity }) => severity === "high")
        .length,
      medium: review.findings.filter(({ severity }) => severity === "medium")
        .length,
      low: review.findings.filter(({ severity }) => severity === "low").length,
      parsed: review.emittedParseableFindings,
    },
  });

  const blocking = review.findings.filter(
    ({ severity }) => severity === BLOCKING_SEVERITY,
  );
  if (blocking.length > 0) {
    return {
      status: "questioned",
      questions: blocking.map(({ summary, why }) =>
        why ? `${summary} — ${why}` : summary,
      ),
    };
  }

  return {
    status: "promoted",
    brief: briefWithColdReadNotes(verdict.brief, review.findings),
    touches: verdict.touches,
  };
};

const WORKFLOWS_THAT_COMMENT_WITHOUT_ANSWERING = ["github-actions"];

const isAReplyFromAPerson = ({ body, author }: IssueComment): boolean =>
  !WORKFLOWS_THAT_COMMENT_WITHOUT_ANSWERING.includes(author) &&
  !body.includes(TRIAGE_DISCLAIMER);

export const awaitingAnAnswer = (
  comments: readonly IssueComment[],
): boolean => {
  const lastQuestions = comments.findLastIndex(({ body }) =>
    body.includes(TRIAGE_NOTES_HEADING),
  );
  return (
    lastQuestions !== -1 &&
    !comments.slice(lastQuestions + 1).some(isAReplyFromAPerson)
  );
};
