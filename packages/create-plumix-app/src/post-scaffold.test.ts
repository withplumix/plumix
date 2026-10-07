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

const base = { targetDir: "/tmp/app", pm: "pnpm" as const, db: false };

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

  it("applies every owner's migrations to the local database after install", async () => {
    const runner = fakeRunner(new Set(["git rev-parse"]));

    const result = await runPostScaffold({
      ...base,
      install: true,
      db: true,
      git: false,
      runner,
    });

    const cmds = runner.calls.map((c) => `${c.command} ${c.args.join(" ")}`);
    expect(cmds).toContain("pnpm exec plumix migrate");
    expect(cmds.filter((cmd) => cmd.includes("migrate"))).toEqual([
      "pnpm exec plumix migrate",
    ]);
    expect(result).toMatchObject({ dbSetup: true });
  });

  it("skips db setup when install did not run", async () => {
    const runner = fakeRunner();

    const result = await runPostScaffold({
      ...base,
      install: false,
      db: true,
      git: false,
      runner,
    });

    expect(runner.calls.some((c) => c.args.includes("migrate"))).toBe(false);
    expect(result.dbSetup).toBe(false);
  });

  it("reports the database setup failed when plumix migrate fails", async () => {
    const runner = fakeRunner(new Set(["pnpm exec"]));

    const result = await runPostScaffold({
      ...base,
      install: true,
      db: true,
      git: false,
      runner,
    });

    expect(result).toMatchObject({ dbSetup: false, dbSetupFailed: true });
  });
});

describe("nextSteps", () => {
  it("is just cd + dev once installed", () => {
    const opts = { installed: true };
    expect(nextSteps("pnpm", "app", opts)).toEqual(["cd app", "pnpm dev"]);
    expect(nextSteps("bun", "app", opts)).toEqual(["cd app", "bun dev"]);
  });

  it("includes install and npm's run prefix when install did not run", () => {
    expect(nextSteps("npm", "app", { installed: false })).toEqual([
      "cd app",
      "npm install",
      "npm run dev",
    ]);
  });

  it("never prints a migrate step, even when the database was not set up", () => {
    expect(nextSteps("pnpm", "app", { installed: true })).toEqual([
      "cd app",
      "pnpm dev",
    ]);
  });
});
