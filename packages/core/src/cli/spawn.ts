import { spawn } from "node:child_process";

import { CliError } from "./errors.js";

interface SpawnOptions {
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export function spawnInherit(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
    });
    child.once("error", (cause) => {
      reject(
        new CliError(`Failed to start ${command}`, {
          code: "SPAWN_FAILED",
          hint: `Is ${command} installed and on PATH?`,
          cause,
        }),
      );
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new CliError(
          `${command} exited with ${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`}`,
          { code: "SPAWN_NONZERO_EXIT" },
        ),
      );
    });
  });
}
