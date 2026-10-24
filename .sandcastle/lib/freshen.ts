import { join } from "node:path";

import type { RunAgentPhase, Thinker } from "./agent.js";
import type { Executor } from "./gates.js";
import { PROMPT_DIR } from "./agent.js";
import { AN_HOUR_IN_SECONDS } from "./sandbox.js";

export const whyTheRebaseIsUnfinished = async (
  sandbox: Executor,
): Promise<string | null> => {
  const stopped = await sandbox.exec(
    'test ! -d "$(git rev-parse --git-path rebase-merge)" && test ! -d "$(git rev-parse --git-path rebase-apply)"',
  );
  if (stopped.exitCode !== 0)
    return "a rebase is still in progress in the sandbox";
  const onMain = await sandbox.exec(
    "git merge-base --is-ancestor origin/main HEAD",
  );
  return onMain.exitCode === 0 ? null : "HEAD does not contain origin/main";
};

/** Runs the resolve-conflicts agent on a rebase that stopped; null when it finished the rebase. */
export const resolveTheRebase = async (
  sandbox: Executor,
  runAgentPhase: RunAgentPhase,
  thinker: Thinker,
  ticket: number,
): Promise<{ readonly unfinished: string | null; readonly stdout: string }> => {
  const resolved = await runAgentPhase("resolve-conflicts", thinker, {
    promptFile: join(PROMPT_DIR, "resolve.md"),
    promptArgs: { TICKET: String(ticket) },
    maxIterations: 10,
    idleTimeoutSeconds: AN_HOUR_IN_SECONDS,
  });
  return {
    unfinished: await whyTheRebaseIsUnfinished(sandbox),
    stdout: resolved.stdout,
  };
};

/**
 * A conflict found here goes to `resolve` rather than being pushed: a branch
 * pushed behind a conflict sits refused until a repair slot frees up, by which
 * time main has often moved again.
 */
export const rebaseOntoLatestMain = async (
  sandbox: Executor,
  fetchMain: () => void,
  resolve?: () => Promise<boolean>,
): Promise<"rebased" | "resolved" | "kept"> => {
  fetchMain();
  const { exitCode } = await sandbox.exec("git rebase origin/main");
  if (exitCode === 0) return "rebased";
  if (resolve && (await resolve())) return "resolved";
  await sandbox.exec("git rebase --abort");
  return "kept";
};
