import type { CommandRegistry } from "plumix";

import { buildCommand } from "./build.js";
import { devCommand } from "./dev.js";

export const commands: CommandRegistry = {
  dev: devCommand,
  build: buildCommand,
};

export { migrations } from "./migrations.js";
