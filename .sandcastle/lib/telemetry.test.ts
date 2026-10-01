import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { PhaseRecord } from "./telemetry.js";
import {
  Journal,
  notionalCostOf,
  usageFromSessionTranscripts,
} from "./telemetry.js";

const assistantLine = (outputTokens: number, cacheRead = 0) =>
  JSON.stringify({
    type: "assistant",
    message: {
      usage: {
        input_tokens: 1,
        output_tokens: outputTokens,
        cache_read_input_tokens: cacheRead,
      },
    },
  });

const transcriptContaining = (...lines: string[]) => {
  const path = join(mkdtempSync(join(tmpdir(), "journal-")), "session.jsonl");
  writeFileSync(path, lines.join("\n"));
  return path;
};

describe("usageFromSessionTranscripts", () => {
  test("sums every assistant message, not only the last one", () => {
    const path = transcriptContaining(
      assistantLine(100),
      assistantLine(250),
      assistantLine(30),
    );

    const usage = usageFromSessionTranscripts([path], new Map());

    expect(usage.outputTokens).toBe(380);
  });

  test("bills a resumed transcript only for the turns appended since the last phase", () => {
    const linesAlreadyBilled = new Map<string, number>();
    const path = transcriptContaining(assistantLine(100), assistantLine(250));

    const firstPhase = usageFromSessionTranscripts([path], linesAlreadyBilled);
    writeFileSync(
      path,
      [assistantLine(100), assistantLine(250), assistantLine(70)].join("\n"),
    );
    const resumedPhase = usageFromSessionTranscripts(
      [path],
      linesAlreadyBilled,
    );

    expect(firstPhase.outputTokens).toBe(350);
    expect(resumedPhase.outputTokens).toBe(70);
  });

  test("bills the sub-agents a session spawned, which Claude Code writes beside it", () => {
    const path = transcriptContaining(assistantLine(100));
    const subagents = join(path.replace(/\.jsonl$/, ""), "subagents");
    mkdirSync(subagents, { recursive: true });
    writeFileSync(join(subagents, "agent-standards.jsonl"), assistantLine(40));
    writeFileSync(join(subagents, "agent-spec.jsonl"), assistantLine(2));

    const usage = usageFromSessionTranscripts([path], new Map());

    expect(usage.outputTokens).toBe(142);
  });

  test("bills a resumed session's sub-agents only for what they wrote since the last phase", () => {
    const linesAlreadyBilled = new Map<string, number>();
    const path = transcriptContaining(assistantLine(100));
    const subagents = join(path.replace(/\.jsonl$/, ""), "subagents");
    mkdirSync(subagents, { recursive: true });
    writeFileSync(join(subagents, "agent-first.jsonl"), assistantLine(40));

    usageFromSessionTranscripts([path], linesAlreadyBilled);
    writeFileSync(join(subagents, "agent-second.jsonl"), assistantLine(7));
    const resumedPhase = usageFromSessionTranscripts(
      [path],
      linesAlreadyBilled,
    );

    expect(resumedPhase.outputTokens).toBe(7);
  });

  test("counts a transcript named twice in one phase only once", () => {
    const path = transcriptContaining(assistantLine(100));

    const usage = usageFromSessionTranscripts([path, path], new Map());

    expect(usage.outputTokens).toBe(100);
  });

  test("ignores lines that are not assistant messages", () => {
    const path = transcriptContaining(
      JSON.stringify({ type: "user", message: { content: "hi" } }),
      "not json at all",
      "",
      assistantLine(42),
    );

    const usage = usageFromSessionTranscripts([path], new Map());

    expect(usage.outputTokens).toBe(42);
  });
});

describe("notionalCostOf", () => {
  test("prices cache reads far below fresh input", () => {
    const millionCacheReads = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    };
    const millionFreshInput = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };

    expect(notionalCostOf(millionCacheReads, "claude-opus-5-5")).toBe(0.2);
    expect(notionalCostOf(millionFreshInput, "claude-opus-5-5")).toBe(4);
  });

  test("prices the reviewer's model", () => {
    const millionOutput = {
      inputTokens: 0,
      outputTokens: 1_000_000,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };

    expect(notionalCostOf(millionOutput, "claude-sonnet-5-5")).toBe(10);
  });

  test("returns undefined for a model it has no rates for", () => {
    const anything = {
      inputTokens: 1,
      outputTokens: 1,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };

    expect(notionalCostOf(anything, "some-future-model")).toBeUndefined();
  });
});

describe("Journal.runId", () => {
  test("lanes opening a journal in the same millisecond do not share a directory", () => {
    const opened = Array.from(
      { length: 8 },
      () => new Journal(mkdtempSync(join(tmpdir(), "journal-"))),
    );

    expect(new Set(opened.map(({ runId }) => runId)).size).toBe(opened.length);
  });
});

describe("Journal.record with a gate run's output", () => {
  const gateRun = {
    phase: "gate:e2e#final.1",
    kind: "gate",
    startedAt: "2026-10-01T00:00:00.000Z",
    durationMs: 1,
    outcome: "fail",
  } as const;

  test("keeps every failed run's output in the phase log the record names", () => {
    const journal = new Journal(mkdtempSync(join(tmpdir(), "journal-")));

    journal.record(gateRun, "http://localhost:3070 is already used");
    journal.record(gateRun, "menu.spec.ts:259 failed");

    const log = readFileSync(journal.logPath(gateRun.phase), "utf8");
    expect(log).toContain("3070 is already used");
    expect(log).toContain("menu.spec.ts:259 failed");
    expect(readJournal(journal).phases[0]?.logFile).toBe(
      journal.logPath(gateRun.phase),
    );
  });

  test("names no log for a run that printed nothing worth keeping", () => {
    const journal = new Journal(mkdtempSync(join(tmpdir(), "journal-")));

    journal.record({ ...gateRun, outcome: "ok" });

    expect(readJournal(journal).phases[0]?.logFile).toBeUndefined();
  });
});

const readJournal = (journal: Journal): { phases: PhaseRecord[] } =>
  JSON.parse(readFileSync(join(journal.dir, "run.json"), "utf8")) as {
    phases: PhaseRecord[];
  };
