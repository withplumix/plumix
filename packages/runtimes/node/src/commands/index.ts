import type { CommandRegistry } from "plumix";

import { buildCommand } from "./build.js";
import { migrateApplyCommand } from "./migrate-apply.js";

export const commands: CommandRegistry = {
  build: buildCommand,
};

export const migrate: CommandRegistry = {
  apply: migrateApplyCommand,
};
