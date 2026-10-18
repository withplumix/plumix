import type { CommandRegistry } from "plumix";
import type {
  RuntimeDiagnose,
  RuntimeMigrations,
  RuntimeSync,
} from "plumix/cli";

import { buildCommand } from "./build.js";
import { devCommand } from "./dev.js";
import { diagnose } from "./diagnose.js";
import { BunCliError } from "./errors.js";
import { migrations } from "./migrations.js";
import { sync } from "./sync.js";

interface BunCommandsModule {
  readonly commands: CommandRegistry;
  readonly migrations: RuntimeMigrations;
  readonly diagnose: RuntimeDiagnose;
  readonly sync: RuntimeSync;
}

/**
 * Under Node every command here would fail somewhere inside `bun:sqlite` or
 * `Bun.serve`, so the module refuses to load and says how to run it instead.
 */
export function bunCommands(scope: {
  readonly Bun?: unknown;
}): BunCommandsModule {
  if (!("Bun" in scope)) throw BunCliError.bunRequired();
  return {
    commands: { dev: devCommand, build: buildCommand },
    migrations,
    diagnose,
    sync,
  };
}
