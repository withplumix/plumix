import type { CommandRegistry } from "plumix";

import { buildCommand } from "./build.js";
import { devCommand } from "./dev.js";
import { migrateApplyCommand } from "./migrate-apply.js";

export const commands: CommandRegistry = {
  dev: devCommand,
  build: buildCommand,
};

export const migrate: CommandRegistry = {
  apply: migrateApplyCommand,
};
