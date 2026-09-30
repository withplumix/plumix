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

const LOST_THE_GIT_CONFIG_LOCK = /could not lock config file/;
const ATTEMPTS_TO_START = 5;

// Sandcastle writes the sandbox's global git config as every run starts, so runs started together
// in one sandbox race for its lock. The loser fails before its agent begins, so starting it again
// repeats nothing.
export const retryALostGitConfigLock = async <T>(
  start: () => Promise<T>,
  pause: (ms: number) => Promise<void>,
): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await start();
    } catch (error) {
      if (
        attempt === ATTEMPTS_TO_START ||
        !LOST_THE_GIT_CONFIG_LOCK.test(String(error))
      )
        throw error;
      await pause(250 + Math.random() * 1_000 * attempt);
    }
  }
};

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
      const result = await retryALostGitConfigLock(
        () =>
          sandbox.run({
            ...options,
            name: phase,
            agent: sandcastle.claudeCode(model, { effort }),
            logging: { type: "file", path: logFile },
          }),
        (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      );
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

const TIMES_TO_ASK_AGAIN = 2;
const FIVE_MINUTES_IN_SECONDS = 300;

export const readOrAskAgain = async <T>(
  runAgentPhase: RunAgentPhase,
  phase: string,
  thinker: Thinker,
  produced: Pick<sandcastle.SandboxRunResult, "stdout" | "iterations">,
  read: (stdout: string) => T | null,
  howToEmit: string,
): Promise<T | null> => {
  let latest = produced;
  for (let ask = 1; ; ask += 1) {
    const value = read(latest.stdout);
    if (value !== null) return value;
    const session = latest.iterations.at(-1)?.sessionId;
    if (!session || ask > TIMES_TO_ASK_AGAIN) return null;
    latest = await runAgentPhase(`${phase}:ask-again${ask}`, thinker, {
      prompt: `The harness could not read the block your last message should have ended with. Change no file and make no commit; only emit the block again.\n\n${howToEmit}`,
      resumeSession: session,
      maxIterations: 1,
      idleTimeoutSeconds: FIVE_MINUTES_IN_SECONDS,
    });
  }
};
