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
      reject(CliError.spawnFailed({ command, cause }));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(CliError.spawnNonzeroExit({ command, exitCode: code, signal }));
    });
  });
}

/**
 * Like {@link spawnInherit}, but the child's stderr is teed — forwarded
 * to ours as it arrives and returned once the child is done — for
 * children whose exit code cannot be trusted to report failure.
 */
export function spawnCapturingStderr(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["inherit", "inherit", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      process.stderr.write(chunk);
    });
    child.stderr.once("error", (cause) => {
      reject(CliError.spawnFailed({ command, cause }));
    });
    child.once("error", (cause) => {
      reject(CliError.spawnFailed({ command, cause }));
    });
    // `close`, not `exit`: exit can fire before the last stderr chunk
    // arrives.
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString("utf8"));
        return;
      }
      reject(CliError.spawnNonzeroExit({ command, exitCode: code, signal }));
    });
  });
}
