import { describe, expect, test } from "vitest";

import { rebaseOntoLatestMain } from "./freshen.js";

const sandbox = (rebaseExitCode: number, ran: string[]) => ({
  exec: async (command: string) => {
    ran.push(command);
    return {
      exitCode: command.startsWith("git rebase origin/main")
        ? rebaseExitCode
        : 0,
      stdout: "",
      stderr: "",
      durationMs: 0,
    };
  },
});

describe("rebaseOntoLatestMain", () => {
  test("a branch main has moved past without conflict is rebased before it is pushed", async () => {
    const ran: string[] = [];
    let fetched = false;

    const outcome = await rebaseOntoLatestMain(sandbox(0, ran), () => {
      fetched = true;
    });

    expect(fetched).toBe(true);
    expect(outcome).toBe("rebased");
    expect(ran).not.toContain("git rebase --abort");
  });

  test("a rebase that conflicts is abandoned, so the branch is pushed as it was gated", async () => {
    const ran: string[] = [];

    const outcome = await rebaseOntoLatestMain(sandbox(1, ran), () => {});

    expect(outcome).toBe("kept");
    expect(ran).toContain("git rebase --abort");
  });
});
