import { describe, expect, test } from "vitest";

import { missingCitedPaths, readOnly } from "./handoff.js";

const branchAt = (head: string) => {
  const state = { head, dirty: "" };
  return {
    state,
    sandbox: {
      exec: async (command: string) => {
        if (command.startsWith("git reset")) {
          state.head = /--hard (\S+)/.exec(command)?.[1] ?? state.head;
          state.dirty = "";
        }
        return {
          exitCode: 0,
          stdout:
            command === "git status --porcelain" ? state.dirty : state.head,
          stderr: "",
        };
      },
    },
  };
};

describe("readOnly", () => {
  test("a phase that leaves the branch alone hands its result over", async () => {
    const { sandbox } = branchAt("abc");

    const outcome = await readOnly(sandbox, async () => "verdict", 2);

    expect(outcome).toEqual({ result: "verdict", discarded: 0 });
  });

  test("edits a read-only phase made are thrown away and the phase runs again on the original commit", async () => {
    const { sandbox, state } = branchAt("abc");
    let runs = 0;

    const outcome = await readOnly(
      sandbox,
      async () => {
        runs++;
        if (runs === 1) {
          state.head = "def";
          state.dirty = " M a.ts";
        }
        return `verdict ${runs}`;
      },
      2,
    );

    expect(outcome).toEqual({ result: "verdict 2", discarded: 1 });
    expect(state.head).toBe("abc");
  });

  test("a phase that edits on every attempt hands nothing over and leaves the original commit", async () => {
    const { sandbox, state } = branchAt("abc");

    const outcome = await readOnly(
      sandbox,
      async () => {
        state.head = "def";
        return "verdict";
      },
      2,
    );

    expect(outcome).toEqual({ result: null, discarded: 2 });
    expect(state.head).toBe("abc");
  });
});

describe("missingCitedPaths", () => {
  const existing = new Set([
    "packages/plugins/seo/src/head.ts",
    "docs/adr/0041-a-sign-in-method-is-a-registered-extension.md",
  ]);
  const exists = async (path: string) => existing.has(path);

  test("names each cited file that is not in the repository", async () => {
    expect(
      await missingCitedPaths(
        [
          "packages/plugins/seo/src/head.ts:289 ogType: isEntry ? article : website",
          "docs/adr/0041-a-sign-in-method-is-a-registered-extension.md:46",
          "packages/core/src/route/render/render-template.test.tsx:520 head shape",
        ],
        exists,
      ),
    ).toEqual(["packages/core/src/route/render/render-template.test.tsx"]);
  });

  test("evidence that cites no file is not a path to check", async () => {
    expect(
      await missingCitedPaths(
        ["gh issue 3531 is open, labelled ready-for-agent"],
        exists,
      ),
    ).toEqual([]);
  });

  test("checks every path an entry cites, not only the first", async () => {
    expect(
      await missingCitedPaths(
        [
          "packages/plugins/seo/src/head.ts:12 and packages/plugins/seo/src/gone.ts:3 agree",
        ],
        exists,
      ),
    ).toEqual(["packages/plugins/seo/src/gone.ts"]);
  });
});
