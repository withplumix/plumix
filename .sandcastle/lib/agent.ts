import { join } from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";

import type { Journal } from "./telemetry.js";
import { notionalCostOf, usageFromSessionTranscripts } from "./telemetry.js";

export const PROMPT_DIR = join(import.meta.dirname, "..", "prompts");

export interface Clock {
  readonly startedAt: string;
  elapsedMs(): number;
}

export const startClock = (): Clock => {
  const startedAtMs = Date.now();
  return {
    startedAt: new Date(startedAtMs).toISOString(),
    elapsedMs: () => Date.now() - startedAtMs,
  };
};

export const parsedJsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const taggedBlock = (stdout: string, tag: string): string | null =>
  stdout.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ??
  null;

type Effort = NonNullable<sandcastle.ClaudeCodeOptions["effort"]>;

export interface Thinker {
  readonly model: string;
  readonly effort: Effort;
}

export type RunAgentPhase = (
  phase: string,
  thinker: Thinker,
  options: Omit<sandcastle.SandboxRunOptions, "agent" | "logging" | "name">,
) => Promise<sandcastle.SandboxRunResult>;

export const agentPhaseRunner =
  (sandbox: sandcastle.Sandbox, journal: Journal): RunAgentPhase =>
  async (phase, { model, effort }, options) => {
    const clock = startClock();
    const logFile = journal.logPath(phase);

    try {
      const result = await sandbox.run({
        ...options,
        name: phase,
        agent: sandcastle.claudeCode(model, { effort }),
        logging: { type: "file", path: logFile },
      });
      const sessionFiles = result.iterations.flatMap(({ sessionFilePath }) =>
        sessionFilePath ? [sessionFilePath] : [],
      );
      const usage = usageFromSessionTranscripts(
        sessionFiles,
        journal.linesAlreadyBilled,
      );

      journal.record({
        phase,
        kind: "agent",
        model,
        effort,
        startedAt: clock.startedAt,
        durationMs: clock.elapsedMs(),
        outcome: "ok",
        iterations: result.iterations.length,
        completionSignal: result.completionSignal,
        commits: result.commits.length,
        usage,
        notionalCostUsd: notionalCostOf(usage, model),
        logFile,
        sessionFiles,
      });
      return result;
    } catch (error) {
      journal.record({
        phase,
        kind: "agent",
        model,
        effort,
        startedAt: clock.startedAt,
        durationMs: clock.elapsedMs(),
        outcome: "error",
        detail: error instanceof Error ? error.message : String(error),
        logFile,
      });
      throw error;
    }
  };
