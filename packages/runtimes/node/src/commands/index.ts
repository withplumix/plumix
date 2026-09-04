import type { CommandRegistry } from "plumix";

import { migrateApplyCommand } from "./migrate-apply.js";

export const migrate: CommandRegistry = {
  apply: migrateApplyCommand,
};
