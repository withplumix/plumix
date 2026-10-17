import { describe, expect, test } from "vitest";

import { underAnOrphanReaper } from "./gates.js";
import { surveyMutants } from "./mutation.js";

const SUMMARY = "# 1 surviving line in 1 package\n";

const sandboxAnswering = (exitCodes: Record<string, number>) => {
  const ran: string[] = [];
  return {
    ran,
    exec: async (command: string) => {
      ran.push(command);
      return {
        exitCode: exitCodes[command] ?? 0,
        stdout: command === "cat .cache/mutation/summary.md" ? SUMMARY : "",
        stderr: "",
        durationMs: 0,
      };
    },
  };
};

describe("surveyMutants", () => {
  test("hands the reviewer the summary the run wrote, and puts the tree back", async () => {
    const sandbox = sandboxAnswering({});

    expect(await surveyMutants(sandbox)).toBe(SUMMARY);
    expect(sandbox.ran).toEqual([
      underAnOrphanReaper("pnpm test:mutation"),
      underAnOrphanReaper("pnpm test:mutation --restore"),
      "cat .cache/mutation/summary.md",
    ]);
  });
});

describe("surveyMutants when the run fails", () => {
  test("says there is no summary, and still puts the tree back", async () => {
    const sandbox = sandboxAnswering({
      [underAnOrphanReaper("pnpm test:mutation")]: 3,
    });

    expect(await surveyMutants(sandbox)).toBe(
      "The mutation run failed this pass, so there is no list of surviving lines to read.",
    );
    expect(sandbox.ran).toContain(
      underAnOrphanReaper("pnpm test:mutation --restore"),
    );
  });
});
