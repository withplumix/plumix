import { describe, expect, test } from "vitest";

import { retryALostGitConfigLock } from "./agent.js";

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
