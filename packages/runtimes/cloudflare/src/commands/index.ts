import type { CommandRegistry } from "plumix";

import { buildCommand } from "./build.js";
import { deployCommand, previewCommand } from "./deploy.js";
import { devCommand } from "./dev.js";
import { typesCommand } from "./types.js";

export const commands: CommandRegistry = {
  dev: devCommand,
  build: buildCommand,
  deploy: deployCommand,
  preview: previewCommand,
  types: typesCommand,
};

export { migrations } from "./migrations.js";
export { diagnose } from "./diagnose.js";
export { sync } from "./sync.js";
