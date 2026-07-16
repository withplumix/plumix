import { spawn } from "node:child_process";

import type { PackageManager } from "./package-manager.js";

/** Runs a command in a directory; `ok` is false on a non-zero exit or spawn error. */
export interface CommandRunner {
  run(
    command: string,
    args: readonly string[],
    cwd: string,
  ): Promise<{ ok: boolean }>;
}

interface PostScaffoldOptions {
  readonly targetDir: string;
  readonly pm: PackageManager;
  readonly install: boolean;
  readonly git: boolean;
  readonly runner: CommandRunner;
}

export interface PostScaffoldResult {
  readonly installed: boolean;
  readonly installFailed: boolean;
  readonly gitInitialized: boolean;
}

/**
 * Run the optional post-scaffold steps: install dependencies, then
 * initialize git with one commit (skipped inside an existing repo). A
 * failed install is reported, never thrown — the generated project still
 * stands and the caller prints manual recovery steps.
 */
export async function runPostScaffold({
  targetDir,
  pm,
  install,
  git,
  runner,
}: PostScaffoldOptions): Promise<PostScaffoldResult> {
  let installed = false;
  let installFailed = false;
  if (install) {
    const { ok } = await runner.run(pm, ["install"], targetDir);
    installed = ok;
    installFailed = !ok;
  }

  let gitInitialized = false;
  if (git) {
    const run = (...args: string[]) => runner.run("git", args, targetDir);
    const inRepo = await run("rev-parse", "--is-inside-work-tree");
    if (!inRepo.ok) {
      const init = await run("init");
      if (init.ok) {
        // `add -A` is safe because the scaffolded .gitignore excludes
        // node_modules/dist/.wrangler (installed just above).
        await run("add", "-A");
        // Best-effort: a commit fails without a configured git identity, but
        // the initialized repo is still useful, so don't gate on it.
        await run("commit", "-m", "Initial commit");
        gitInitialized = true;
      }
    }
  }

  return { installed, installFailed, gitInitialized };
}

/** Copy-pasteable commands to finish getting started. */
export function nextSteps(
  pm: PackageManager,
  name: string,
  installed: boolean,
): string[] {
  const steps = [`cd ${name}`];
  if (!installed) steps.push(`${pm} install`);
  steps.push(pm === "npm" ? "npm run dev" : `${pm} dev`);
  return steps;
}

/** Production {@link CommandRunner}, inheriting stdio so output is visible. */
export const spawnRunner: CommandRunner = {
  run(command, args, cwd) {
    return new Promise((resolve) => {
      // Windows package managers are `.cmd` shims that only spawn via a shell;
      // args here are static literals, so there is no injection surface.
      const child = spawn(command, args, {
        cwd,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      child.on("error", () => resolve({ ok: false }));
      child.on("close", (code) => resolve({ ok: code === 0 }));
    });
  },
};
