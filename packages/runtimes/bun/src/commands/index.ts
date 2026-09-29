import type { CommandRegistry } from "plumix";
import { CliError } from "plumix/cli";

import { migrateApplyCommand } from "./migrate-apply.js";

// Under Node every command here would fail somewhere inside `bun:sqlite` or
// `Bun.serve`, so the module refuses to load and says how to run it instead.
if (!("Bun" in globalThis)) throw CliError.bunRequired();

export const commands: CommandRegistry = {};

export const migrate: CommandRegistry = {
  apply: migrateApplyCommand,
};
