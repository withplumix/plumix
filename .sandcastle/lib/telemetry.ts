import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface ModelRatesPerMillionTokens {
  readonly input: number;
  readonly output: number;
  readonly cacheWrite: number;
  readonly cacheRead: number;
}

const RATES_PER_MILLION_TOKENS: Record<string, ModelRatesPerMillionTokens> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

export type RunOutcome =
  "shipped" | "failed" | "promoted" | "closed" | "questioned" | "skipped";

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
}

interface FindingTally {
  readonly total: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly parsed: boolean;
}

export interface PhaseRecord {
  readonly phase: string;
  readonly kind: "agent" | "gate" | "review";
  readonly model?: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly outcome: "ok" | "fail" | "error" | "skipped";
  readonly detail?: string;
  readonly iterations?: number;
  readonly completionSignal?: string;
  readonly commits?: number;
  readonly usage?: Usage;
  readonly notionalCostUsd?: number;
  readonly findings?: FindingTally;
  readonly command?: string;
  readonly exitCode?: number;
  readonly logFile?: string;
  readonly sessionFiles?: readonly string[];
}

const NO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
};

const plus = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheCreationInputTokens:
    a.cacheCreationInputTokens + b.cacheCreationInputTokens,
  cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
});

const totalUsage = (records: readonly PhaseRecord[]): Usage =>
  records.reduce(
    (running, { usage }) => plus(running, usage ?? NO_USAGE),
    NO_USAGE,
  );

export const notionalCostOf = (
  usage: Usage,
  model: string,
): number | undefined => {
  const rates = RATES_PER_MILLION_TOKENS[model];
  if (!rates) return undefined;
  return (
    (usage.inputTokens * rates.input +
      usage.outputTokens * rates.output +
      usage.cacheCreationInputTokens * rates.cacheWrite +
      usage.cacheReadInputTokens * rates.cacheRead) /
    1_000_000
  );
};

interface AssistantTokenCounts {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly cache_read_input_tokens?: number;
}

interface TranscriptLine {
  readonly usage?: unknown;
  readonly message?: { readonly usage?: unknown };
}

const assistantTokenCountsIn = (line: unknown): AssistantTokenCounts | null => {
  if (typeof line !== "object" || line === null) return null;
  const { usage, message } = line as TranscriptLine;
  const counts = message?.usage ?? usage;
  if (typeof counts !== "object" || counts === null) return null;
  return "output_tokens" in counts ? (counts as AssistantTokenCounts) : null;
};

const parseTranscriptLine = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

const readLines = (path: string): readonly string[] => {
  try {
    return readFileSync(path, "utf8").split("\n");
  } catch {
    return [];
  }
};

export const usageFromSessionTranscripts = (
  paths: readonly string[],
  linesAlreadyBilled: Map<string, number>,
): Usage => {
  let total = NO_USAGE;

  for (const path of new Set(paths)) {
    const lines = readLines(path);
    const unbilled = lines.slice(linesAlreadyBilled.get(path) ?? 0);

    for (const line of unbilled) {
      const counts = assistantTokenCountsIn(parseTranscriptLine(line));
      if (!counts) continue;
      total = plus(total, {
        inputTokens: counts.input_tokens ?? 0,
        outputTokens: counts.output_tokens ?? 0,
        cacheCreationInputTokens: counts.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: counts.cache_read_input_tokens ?? 0,
      });
    }
    linesAlreadyBilled.set(path, lines.length);
  }

  return total;
};

const asSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
const asThousands = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const pluralGates = (n: number): string => (n === 1 ? "gate run" : "gate runs");

interface RunTotals {
  readonly durationMs: number;
  readonly agentCalls: number;
  readonly gateRuns: number;
  readonly gateFailures: number;
  readonly findings: number;
  readonly usage: Usage;
  readonly notionalCostUsd: number;
}

interface RunJournal {
  readonly runId: string;
  readonly startedAt: string;
  readonly ticket?: { readonly number: number; readonly title: string };
  readonly branch?: string;
  readonly outcome: string;
  readonly error?: string;
  readonly totals: RunTotals;
  readonly phases: readonly PhaseRecord[];
}

const NOTIONAL_COST_DISCLAIMER =
  "Cost is notional: these runs authenticate with a subscription token and are not billed per token. It is a unit of work for comparing phases and models.";

const phaseNote = (record: PhaseRecord): string => {
  if (record.kind === "gate") return `exit ${record.exitCode}`;
  if (record.findings) {
    const { total, high, medium, low, parsed } = record.findings;
    return `${total} findings (${high}h/${medium}m/${low}l)${parsed ? "" : " — UNPARSED"}`;
  }
  if (record.commits === undefined) return "";
  return `${record.commits} commits${record.completionSignal ? "" : ", no completion signal"}`;
};

const asMarkdownRow = (record: PhaseRecord): string => {
  const cost =
    record.notionalCostUsd === undefined
      ? "—"
      : `$${record.notionalCostUsd.toFixed(3)}`;
  const tokens = record.usage
    ? `${asThousands(record.usage.inputTokens + record.usage.cacheReadInputTokens)} / ${asThousands(record.usage.outputTokens)}`
    : "—";
  return `| ${record.phase} | ${record.model ?? "—"} | ${record.outcome} | ${asSeconds(record.durationMs)} | ${tokens} | ${cost} | ${phaseNote(record)} |`;
};

const asMarkdown = (journal: RunJournal): string => {
  const { totals: t } = journal;
  return `# Run ${journal.runId}

**Ticket** ${journal.ticket ? `#${journal.ticket.number} ${journal.ticket.title}` : "—"}
**Branch** ${journal.branch ?? "—"}
**Outcome** ${journal.outcome}${journal.error ? ` — ${journal.error}` : ""}

| phase | model | outcome | wall | tok in/out | cost | note |
| --- | --- | --- | --- | --- | --- | --- |
${journal.phases.map(asMarkdownRow).join("\n")}

**Totals** ${asSeconds(t.durationMs)} wall · ${t.agentCalls} agent calls · ${t.gateRuns} ${pluralGates(t.gateRuns)} (${t.gateFailures} failed) · ${t.findings} findings · ~$${t.notionalCostUsd.toFixed(2)}

${NOTIONAL_COST_DISCLAIMER}
`;
};

let journalsOpenedInThisProcess = 0;

export class Journal {
  readonly runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${(journalsOpenedInThisProcess += 1)}`;
  readonly dir: string;
  readonly linesAlreadyBilled = new Map<string, number>();

  readonly #logDir: string;
  readonly #startedAtMs = Date.now();
  readonly #phases: PhaseRecord[] = [];
  #ticket?: { number: number; title: string };
  #branch?: string;

  constructor(root: string) {
    this.dir = join(root, "runs", this.runId);
    this.#logDir = join(this.dir, "logs");
    mkdirSync(this.#logDir, { recursive: true });
  }

  get #saidBy(): string {
    return this.#ticket ? `#${this.#ticket.number} ` : "";
  }

  logPath(phase: string): string {
    return join(this.#logDir, `${phase.replace(/[^a-z0-9]+/gi, "-")}.log`);
  }

  setTicket(ticket: { number: number; title: string }, branch?: string): void {
    this.#ticket = ticket;
    this.#branch = branch;
    this.#persist("running");
  }

  record(phase: PhaseRecord): void {
    this.#phases.push(phase);
    this.#persist("running");

    const cost =
      phase.notionalCostUsd === undefined
        ? ""
        : ` $${phase.notionalCostUsd.toFixed(3)}`;
    const note = phaseNote(phase);
    console.log(
      `    ⤷ ${this.#saidBy}${phase.phase} ${phase.outcome} ${asSeconds(phase.durationMs)}${cost}${note ? ` ${note}` : ""}`,
    );
  }

  finish(outcome: RunOutcome, error?: string): void {
    const journal = this.#persist(outcome, error);
    const { usage, ...t } = journal.totals;
    console.log(
      `\n${this.#saidBy}${outcome} in ${asSeconds(t.durationMs)} — ${t.agentCalls} agent calls, ` +
        `${t.gateRuns} ${pluralGates(t.gateRuns)} (${t.gateFailures} failed), ` +
        `${asThousands(usage.inputTokens + usage.cacheReadInputTokens)} in / ` +
        `${asThousands(usage.outputTokens)} out, ~$${t.notionalCostUsd.toFixed(2)}`,
    );
    console.log(`    ${this.#saidBy}journal: ${join(this.dir, "run.json")}`);
  }

  #totals(): RunTotals {
    const agents = this.#phases.filter(({ kind }) => kind === "agent");
    const gates = this.#phases.filter(({ kind }) => kind === "gate");
    return {
      durationMs: Date.now() - this.#startedAtMs,
      agentCalls: agents.length,
      gateRuns: gates.length,
      gateFailures: gates.filter(({ outcome }) => outcome === "fail").length,
      findings: this.#phases.reduce(
        (n, { findings }) => n + (findings?.total ?? 0),
        0,
      ),
      usage: totalUsage(agents),
      notionalCostUsd: this.#phases.reduce(
        (n, { notionalCostUsd }) => n + (notionalCostUsd ?? 0),
        0,
      ),
    };
  }

  #persist(outcome: string, error?: string): RunJournal {
    const journal: RunJournal = {
      runId: this.runId,
      startedAt: new Date(this.#startedAtMs).toISOString(),
      ticket: this.#ticket,
      branch: this.#branch,
      outcome,
      error,
      totals: this.#totals(),
      phases: this.#phases,
    };
    writeFileSync(join(this.dir, "run.json"), JSON.stringify(journal, null, 2));
    writeFileSync(join(this.dir, "summary.md"), asMarkdown(journal));
    return journal;
  }
}
