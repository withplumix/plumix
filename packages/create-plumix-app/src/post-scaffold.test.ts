import { describe, expect, it } from "vitest";

import type { CommandRunner } from "./post-scaffold.js";
import { nextSteps, runPostScaffold } from "./post-scaffold.js";

interface Call {
  command: string;
  args: readonly string[];
}

function fakeRunner(fail = new Set<string>()): CommandRunner & {
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    run: (command, args) => {
      calls.push({ command, args });
      return Promise.resolve({ ok: !fail.has(`${command} ${args[0] ?? ""}`) });
    },
  };
}

const base = { targetDir: "/tmp/app", pm: "pnpm" as const };

describe("runPostScaffold", () => {
  it("installs then inits git with an initial commit", async () => {
    // git rev-parse fails → not already in a repo → init proceeds.
    const runner = fakeRunner(new Set(["git rev-parse"]));

    const result = await runPostScaffold({
      ...base,
      install: true,
      git: true,
      runner,
    });

    expect(runner.calls.map((c) => `${c.command} ${c.args[0]}`)).toEqual([
      "pnpm install",
      "git rev-parse",
      "git init",
      "git add",
      "git commit",
    ]);
    expect(result).toMatchObject({ installed: true, gitInitialized: true });
  });

  it("skips install when disabled", async () => {
    const runner = fakeRunner(new Set(["git rev-parse"]));
    await runPostScaffold({ ...base, install: false, git: true, runner });
    expect(runner.calls.some((c) => c.command === "pnpm")).toBe(false);
  });

  it("does not init git inside an existing repo", async () => {
    // rev-parse succeeds → already in a repo → no init.
    const runner = fakeRunner();
    const result = await runPostScaffold({
      ...base,
      install: false,
      git: true,
      runner,
    });
    expect(runner.calls.map((c) => c.args[0])).toEqual(["rev-parse"]);
    expect(result.gitInitialized).toBe(false);
  });

  it("reports a failed install without throwing", async () => {
    const runner = fakeRunner(new Set(["pnpm install"]));
    const result = await runPostScaffold({
      ...base,
      install: true,
      git: false,
      runner,
    });
    expect(result).toMatchObject({ installed: false, installFailed: true });
  });
});

describe("nextSteps", () => {
  it("skips install when it already ran, and uses the manager's run form", () => {
    expect(nextSteps("pnpm", "app", true)).toEqual(["cd app", "pnpm dev"]);
    expect(nextSteps("bun", "app", true)).toEqual(["cd app", "bun dev"]);
  });

  it("includes install and npm's run prefix when not installed", () => {
    expect(nextSteps("npm", "app", false)).toEqual([
      "cd app",
      "npm install",
      "npm run dev",
    ]);
  });
});
