import type { CommandRegistry } from "@plumix/core";

import { buildCommand } from "./build.js";
import { deployCommand } from "./deploy.js";
import { devCommand } from "./dev.js";
import { typesCommand } from "./types.js";

export const commands: CommandRegistry = {
  dev: devCommand,
  build: buildCommand,
  deploy: deployCommand,
  types: typesCommand,
};
