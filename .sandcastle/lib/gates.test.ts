import { describe, expect, test } from "vitest";

import type { Gate } from "./gates.js";
import { gateBehindCheck, runGates } from "./gates.js";

const sandboxWhereTheseCommandsFail = (failing: readonly string[]) => ({
  exec: async (command: string) => ({
    exitCode: failing.includes(command) ? 1 : 0,
    stdout: "",
    stderr: "",
    durationMs: 0,
  }),
});

const gate = (name: string): Gate => ({ name, command: name });
const THREE_GATES = [gate("typecheck"), gate("lint"), gate("knip")];
const ignoreResults = () => {};

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

describe("gateBehindCheck", () => {
  test.each([
    ["Commitlint", "commitlint"],
    ["Are The Types Wrong", "attw"],
    ["i18n ratchet", "i18n-ratchet"],
    ["Test (build)", "test"],
    ["Changesets", "changeset"],
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
      if (command !== flaky)
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
      seen += 1;
      return {
        exitCode: seen === 1 ? 1 : 0,
        stdout: "",
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

  test("without the option a failure is handed on at once", async () => {
    const { failures } = await runGates(
      sandboxWhereACommandFailsOnce("lint"),
      THREE_GATES,
      { stopAtFirstFailure: true, onResult: ignoreResults },
    );

    expect(failures.map(({ name }) => name)).toEqual(["lint"]);
  });
});
