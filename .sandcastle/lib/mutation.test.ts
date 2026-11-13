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
  test("names why it failed, from the end of the run's output, so the failure can be fixed", async () => {
    const failing = underAnOrphanReaper("pnpm test:mutation");
    const ran: string[] = [];
    const sandbox = {
      exec: async (command: string) => {
        ran.push(command);
        return command === failing
          ? {
              exitCode: 3,
              stdout:
                "noise\n".repeat(100) +
                "@plumix/admin-editor#test:mutation: exited 1",
              stderr: "",
              durationMs: 0,
            }
          : { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
      },
    };

    const survey = await surveyMutants(sandbox);

    expect(survey).toContain("@plumix/admin-editor#test:mutation: exited 1");
    expect(survey.split("noise")).toHaveLength(40);
  });

  test("says there is no summary, and still puts the tree back", async () => {
    const sandbox = sandboxAnswering({
      [underAnOrphanReaper("pnpm test:mutation")]: 3,
    });

    expect(await surveyMutants(sandbox)).toContain(
      "The mutation run failed this pass, so there is no list of surviving lines to read.",
    );
    expect(sandbox.ran).toContain(
      underAnOrphanReaper("pnpm test:mutation --restore"),
    );
  });
});
