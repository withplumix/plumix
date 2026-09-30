import { describe, expect, test } from "vitest";

import type { RunAgentPhase } from "./agent.js";
import { readOrAskAgain, retryALostGitConfigLock } from "./agent.js";

const LOST_THE_LOCK =
  'Command failed (exit 255): git config --global --add safe.directory "/home/agent/workspace"\nerror: could not lock config file /home/agent/.gitconfig: File exists';

const startingAfter = (failures: readonly string[]) => {
  let calls = 0;
  return {
    start: async () => {
      const failure = failures[calls];
      calls += 1;
      if (failure !== undefined) throw new Error(failure);
      return "ran";
    },
    calls: () => calls,
  };
};

describe("retryALostGitConfigLock", () => {
  test("a run that lost the sandbox's git config lock to a run starting beside it starts again", async () => {
    const run = startingAfter([LOST_THE_LOCK, LOST_THE_LOCK]);

    await expect(
      retryALostGitConfigLock(run.start, async () => {}),
    ).resolves.toBe("ran");
    expect(run.calls()).toBe(3);
  });

  test("any other failure is handed on at once", async () => {
    const run = startingAfter(["claude-code exited with code 1"]);

    await expect(
      retryALostGitConfigLock(run.start, async () => {}),
    ).rejects.toThrow("claude-code exited");
    expect(run.calls()).toBe(1);
  });

  test("a lock that is never freed is reported, not waited on forever", async () => {
    const run = startingAfter(Array.from({ length: 20 }, () => LOST_THE_LOCK));

    await expect(
      retryALostGitConfigLock(run.start, async () => {}),
    ).rejects.toThrow("could not lock config file");
    expect(run.calls()).toBeLessThan(20);
  });
});

describe("readOrAskAgain", () => {
  const THINKER = { model: "claude-sonnet-5-5", effort: "high" } as const;
  const ranWith = (stdout: string, sessionId = "s1") =>
    ({ stdout, iterations: [{ sessionId }] }) as unknown as Awaited<
      ReturnType<RunAgentPhase>
    >;
  const readAnswer = (stdout: string) =>
    stdout.match(/<answer>(.+)<\/answer>/)?.[1] ?? null;

  test("reads what the phase emitted without asking again", async () => {
    const asked: string[] = [];

    const value = await readOrAskAgain(
      async (phase) => {
        asked.push(phase);
        return ranWith("");
      },
      "review#1",
      THINKER,
      ranWith("<answer>42</answer>"),
      readAnswer,
      "Emit <answer>.",
    );

    expect(value).toBe("42");
    expect(asked).toEqual([]);
  });

  test("resumes the same session to ask for a block it could not read", async () => {
    const asked: { phase: string; resumeSession?: string }[] = [];

    const value = await readOrAskAgain(
      async (phase, _thinker, options) => {
        asked.push({ phase, resumeSession: options.resumeSession });
        return ranWith("<answer>42</answer>", "s2");
      },
      "review#1",
      THINKER,
      ranWith("I reviewed it, all good", "s1"),
      readAnswer,
      "Emit <answer>.",
    );

    expect(value).toBe("42");
    expect(asked).toEqual([
      { phase: "review#1:ask-again1", resumeSession: "s1" },
    ]);
  });

  test("gives up after asking twice", async () => {
    let asks = 0;

    const value = await readOrAskAgain(
      async () => {
        asks += 1;
        return ranWith("still nothing");
      },
      "review#1",
      THINKER,
      ranWith("nothing"),
      readAnswer,
      "Emit <answer>.",
    );

    expect(value).toBeNull();
    expect(asks).toBe(2);
  });
});
