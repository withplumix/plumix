import { describe, expect, test } from "vitest";

import type { Gate, GateResult } from "./gates.js";
import {
  gateBehindCheck,
  GATES,
  GATES_LEFT_TO_CI,
  gatesAfterLanding,
  runGates,
  underAnOrphanReaper,
} from "./gates.js";

const sandboxWhereTheseCommandsFail = (failing: readonly string[]) => ({
  exec: async (command: string) => ({
    exitCode: failing.map(underAnOrphanReaper).includes(command) ? 1 : 0,
    stdout: "",
    stderr: "",
    durationMs: 0,
  }),
});

const gate = (name: string): Gate => ({ name, command: name });
const THREE_GATES = [gate("typecheck"), gate("lint"), gate("knip")];
const ignoreResults = () => {};

describe("gatesAfterLanding", () => {
  test("a resolved conflict reruns typecheck and the admin verification, since the other gates passed on the same diff minutes before", () => {
    expect(gatesAfterLanding("resolved", true).map(({ name }) => name)).toEqual(
      ["typecheck", "verify-admin"],
    );
  });

  test("a clean rebase that moved the branch reruns the admin verification, so its evidence covers the commit that ships", () => {
    expect(gatesAfterLanding("rebased", true).map(({ name }) => name)).toEqual([
      "verify-admin",
    ]);
  });

  test("a rebase onto the main the branch already had reruns nothing", () => {
    expect(gatesAfterLanding("rebased", false)).toEqual([]);
  });

  test("a branch kept as it was gated reruns nothing", () => {
    expect(gatesAfterLanding("kept", false)).toEqual([]);
  });
});

describe("the verify-admin gate", () => {
  const verifyAdmin = GATES.find(({ name }) => name === "verify-admin");

  test("runs before the push, with the fast gates", () => {
    expect(verifyAdmin).toBeDefined();
  });

  test.each([
    "packages/admin/src/routes/users.tsx",
    "packages/admin-ui/src/button.tsx",
    "packages/core/src/route/admin.ts",
    "apps/docs/src/page.tsx",
  ])("applies to a diff that touches %s", (path) => {
    expect(verifyAdmin?.appliesWhen?.(["README.md", path])).toBe(true);
  });

  test.each([
    "packages/core/src/db/schema.ts",
    "packages/runtime-node/src/index.ts",
    ".sandcastle/lib/gates.ts",
  ])("does not apply to a diff that only touches %s", (path) => {
    expect(verifyAdmin?.appliesWhen?.([path])).toBe(false);
  });

  test("needs the Chromium the e2e gate needs", () => {
    const e2e = GATES_LEFT_TO_CI.find(({ name }) => name === "e2e");

    expect(verifyAdmin?.requires).toBe(e2e?.requires);
  });

  test("is behind no CI check yet, so a red CI check never sends a repair to it", () => {
    const checks = [
      "Commitlint",
      "Changesets",
      "Lint",
      "Format",
      "Typecheck",
      "Knip",
      "i18n",
      "Test",
      "Test (e2e)",
      "Publint",
      "Are The Types Wrong",
    ];

    expect(checks.map((check) => gateBehindCheck(check)?.name)).not.toContain(
      "verify-admin",
    );
  });
});

describe("runGates", () => {
  test("surveying reports every red gate, not only the first", async () => {
    const { failures } = await runGates(
      sandboxWhereTheseCommandsFail(["lint", "knip"]),
      THREE_GATES,
      { stopAtFirstFailure: false, onResult: ignoreResults },
    );

    expect(failures.map(({ name }) => name)).toEqual(["lint", "knip"]);
  });

  test("surveying runs the gates after a failure instead of stopping", async () => {
    const ran: string[] = [];
    await runGates(sandboxWhereTheseCommandsFail(["typecheck"]), THREE_GATES, {
      stopAtFirstFailure: false,
      onResult: ({ name }) => ran.push(name),
    });

    expect(ran).toEqual(["typecheck", "lint", "knip"]);
  });

  test("fixing stops at the first red gate so the fixer sees one failure at a time", async () => {
    const ran: string[] = [];
    const { failures } = await runGates(
      sandboxWhereTheseCommandsFail(["lint", "knip"]),
      THREE_GATES,
      { stopAtFirstFailure: true, onResult: ({ name }) => ran.push(name) },
    );

    expect(ran).toEqual(["typecheck", "lint"]);
    expect(failures.map(({ name }) => name)).toEqual(["lint"]);
  });
});

describe("a gate that runs its own commands", () => {
  const ownCommands = (seen: string[]): Gate => ({
    name: "verify-admin",
    command: "the declared commands",
    run: async (sandbox) => {
      await sandbox.exec("pnpm verify:admin --site core");
      return { exitCode: 0, output: "1 run clean", artifacts: ".cache/x" };
    },
  });

  test("runs them under the orphan reaper", async () => {
    const seen: string[] = [];
    await runGates(
      {
        exec: async (command) => {
          seen.push(command);
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
        },
      },
      [ownCommands(seen)],
      { stopAtFirstFailure: true, onResult: ignoreResults },
    );

    expect(seen).toContain(
      underAnOrphanReaper("pnpm verify:admin --site core"),
    );
  });

  test("keeps its output and the folder its evidence is in, even when it passes", async () => {
    const results: GateResult[] = [];
    await runGates(sandboxWhereTheseCommandsFail([]), [ownCommands([])], {
      stopAtFirstFailure: true,
      onResult: (result) => results.push(result),
    });

    expect(results).toEqual([
      expect.objectContaining({
        outcome: "ok",
        output: "1 run clean",
        artifacts: ".cache/x",
      }),
    ]);
  });
});

describe("gateBehindCheck", () => {
  test.each([
    ["Commitlint", "commitlint"],
    ["Are The Types Wrong", "attw"],
    ["Changesets", "check-no-major"],
  ])("CI's %s reproduces locally as the %s gate", (checkName, gateName) => {
    expect(gateBehindCheck(checkName)?.name).toBe(gateName);
  });

  test("a CI check the harness cannot reproduce is reported, not guessed at", () => {
    expect(gateBehindCheck("Spellcheck")).toBeUndefined();
    expect(gateBehindCheck("Smoke (scaffold)")).toBeUndefined();
  });
});

const sandboxWhereACommandFailsOnce = (flaky: string) => {
  let seen = 0;
  return {
    exec: async (command: string) => {
      if (command !== underAnOrphanReaper(flaky))
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
      seen += 1;
      return {
        exitCode: seen === 1 ? 1 : 0,
        stdout: seen === 1 ? "http://localhost:3070 is already used" : "",
        stderr: "",
        durationMs: 0,
      };
    },
  };
};

describe("a gate that fails once", () => {
  test("is given a second run before the fixer is woken", async () => {
    const { failures } = await runGates(
      sandboxWhereACommandFailsOnce("lint"),
      THREE_GATES,
      {
        stopAtFirstFailure: true,
        onResult: ignoreResults,
        retryAFailureOnce: true,
      },
    );

    expect(failures).toEqual([]);
  });

  test("still fails when the second run agrees with the first", async () => {
    const { failures } = await runGates(
      sandboxWhereTheseCommandsFail(["lint"]),
      THREE_GATES,
      {
        stopAtFirstFailure: true,
        onResult: ignoreResults,
        retryAFailureOnce: true,
      },
    );

    expect(failures.map(({ name }) => name)).toEqual(["lint"]);
  });

  test("the retry is recorded, so a flake is visible instead of absorbed", async () => {
    const seen: string[] = [];
    await runGates(sandboxWhereACommandFailsOnce("lint"), THREE_GATES, {
      stopAtFirstFailure: true,
      onResult: ({ name, outcome }) => seen.push(`${name}:${outcome}`),
      retryAFailureOnce: true,
    });

    expect(seen).toEqual(["typecheck:ok", "lint:fail", "lint:ok", "knip:ok"]);
  });

  test("the failed run keeps its output even when the retry passes", async () => {
    const results: GateResult[] = [];
    await runGates(sandboxWhereACommandFailsOnce("lint"), THREE_GATES, {
      stopAtFirstFailure: true,
      onResult: (result) => results.push(result),
      retryAFailureOnce: true,
    });

    const lint = results.filter(({ name }) => name === "lint");
    expect(lint.map(({ outcome, output }) => [outcome, output])).toEqual([
      ["fail", expect.stringContaining("3070 is already used")],
      ["ok", undefined],
    ]);
  });

  test("without the option a failure is handed on at once", async () => {
    const { failures } = await runGates(
      sandboxWhereACommandFailsOnce("lint"),
      THREE_GATES,
      { stopAtFirstFailure: true, onResult: ignoreResults },
    );

    expect(failures.map(({ name }) => name)).toEqual(["lint"]);
  });
});

describe("package-scoped gates", () => {
  test.each(["lint", "typecheck", "test", "e2e", "publint", "attw"])(
    "%s runs only the packages the branch changed and the packages that depend on them",
    (name) => {
      const gate = [...GATES, ...GATES_LEFT_TO_CI].find(
        (candidate) => candidate.name === name,
      );

      expect(gate?.command).toContain("--filter=...[origin/main]");
    },
  );

  test.each(["lint", "typecheck", "test", "e2e", "publint", "attw"])(
    "%s prints only the tasks that failed, so the output the fixer is handed ends with the failure",
    (name) => {
      const gate = [...GATES, ...GATES_LEFT_TO_CI].find(
        (candidate) => candidate.name === name,
      );

      expect(gate?.command).toContain("--output-logs=errors-only");
    },
  );
});

describe("the test gate", () => {
  test("runs every package's tests after one fails, so a waived failure hides nothing", () => {
    const gate = GATES_LEFT_TO_CI.find(
      (candidate) => candidate.name === "test",
    );

    expect(gate?.command).toContain("--continue");
  });

  test("runs only the unit tier, the one test tier turbo runs", () => {
    const gate = GATES_LEFT_TO_CI.find(
      (candidate) => candidate.name === "test",
    );

    expect(gate?.command).toMatch(/turbo run test:unit --/);
  });
});

describe("the gates a branch passes before its push", () => {
  test("leave lint, test and e2e to CI, which took 18 of the 27 local gate minutes per ticket on 2026-10-23", () => {
    const local = GATES.map(({ name }) => name);
    const inCi = GATES_LEFT_TO_CI.map(({ name }) => name);

    expect(local).not.toContain("lint");
    expect(local).not.toContain("test");
    expect(local).not.toContain("e2e");
    expect(inCi).toEqual(expect.arrayContaining(["lint", "test", "e2e"]));
  });

  test("keep the checks that take seconds or catch most CI failures cheaply", () => {
    expect(GATES.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "check-no-major",
        "commitlint",
        "format",
        "i18n",
        "knip",
        "publint",
        "typecheck",
      ]),
    );
  });
});

describe("the publint gate", () => {
  test("runs before the push, because CI's Publint failed 2 of 3 loop pull requests on 2026-10-23", () => {
    expect(GATES.map(({ name }) => name)).toContain("publint");
  });

  test("also runs surface:check, the second step of CI's Publint job", () => {
    const gate = GATES.find(({ name }) => name === "publint");

    expect(gate?.command).toMatch(/turbo run publint surface:check /);
  });
});

describe("a gate command runs under an orphan reaper", () => {
  // `sleep infinity` as PID 1 never reaps orphans, and a zombie still answers
  // `kill -0`, so waiting for one to exit runs out the timeout.
  test("so a process the gate orphans is reaped instead of left as a zombie", async () => {
    const ran: string[] = [];
    const sandbox = {
      exec: async (command: string) => {
        ran.push(command);
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
      },
    };

    await runGates(sandbox, [gate("pnpm test")], {
      stopAtFirstFailure: true,
      onResult: ignoreResults,
    });

    expect(ran).toContain("tini -s -- sh -c 'pnpm test'");
  });

  test("a command with its own quotes reaches the shell unchanged", () => {
    expect(
      underAnOrphanReaper(`test -n "$(git diff)" || { echo 'none'; exit 1; }`),
    ).toBe(
      `tini -s -- sh -c 'test -n "$(git diff)" || { echo '\\''none'\\''; exit 1; }'`,
    );
  });
});
