import type { CommandRegistry } from "plumix";

import { buildCommand } from "./build.js";
import { devCommand } from "./dev.js";
import { BunCliError } from "./errors.js";
import { migrateApplyCommand } from "./migrate-apply.js";

// Under Node every command here would fail somewhere inside `bun:sqlite` or
// `Bun.serve`, so the module refuses to load and says how to run it instead.
if (!("Bun" in globalThis)) throw BunCliError.bunRequired();

export const commands: CommandRegistry = {
  dev: devCommand,
  build: buildCommand,
};

export const migrate: CommandRegistry = {
  apply: migrateApplyCommand,
};
