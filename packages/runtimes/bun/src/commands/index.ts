import { bunCommands } from "./bun-commands.js";

export const { commands, migrations, diagnose, sync } = bunCommands(globalThis);
